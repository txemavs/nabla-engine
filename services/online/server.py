"""Single-process, ephemeral lobby and room-space presence. No combat authority yet."""
import asyncio
import contextlib
import json
import math
import os
import time
import uuid
from urllib.parse import urlsplit

from aiohttp import web, WSMsgType


def vector(value, length):
    if (not isinstance(value, list) or len(value) != length
            or any(type(x) not in (int, float) or not math.isfinite(x)
                   or abs(x) > 1e9 for x in value)):
        raise ValueError("Coordenadas no válidas")
    return value


def pose(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("Pose no válida")
    position = vector(value.get("position"), 3)
    rotation = vector(value.get("rotation"), 4)
    norm = math.sqrt(sum(x * x for x in rotation))
    if not 0.5 < norm < 1.5:
        raise ValueError("Rotación no válida")
    return {"position": position, "rotation": [x / norm for x in rotation]}


def text(value, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError("Nombre no válido")
    return value.strip()


def place(value):
    if not isinstance(value, dict) or value.get("kind") not in ("room", "world"):
        raise ValueError("Lugar no válido")
    origin = vector(value.get("origin"), 3)
    geography = value.get("geography")
    if geography is not None:
        if not isinstance(geography, dict):
            raise ValueError("Geografía no válida")
        geo = vector([geography.get(k) for k in ("latitude", "longitude", "altitude")], 3)
        if not -90 <= geo[0] <= 90 or not -180 <= geo[1] <= 180:
            raise ValueError("Geografía no válida")
        geography = dict(zip(("latitude", "longitude", "altitude"), geo))
    return {"kind": value["kind"], "label": text(value.get("label"), 100),
            "origin": origin, "geography": geography}


class Peer:
    def __init__(self, ws):
        self.ws = ws
        self.id = uuid.uuid4().hex
        self.game = None
        self.member = None
        self.sequence = -1
        self.tokens = 90.0
        self.last = time.monotonic()
        self.queue = asyncio.Queue(maxsize=32)
        self.snapshot = None
        self.wake = asyncio.Event()

    def send(self, message, snapshot=False):
        if snapshot:
            self.snapshot = message
        else:
            try:
                self.queue.put_nowait(message)
            except asyncio.QueueFull:
                asyncio.create_task(self.ws.close(code=1013, message=b"Slow consumer"))
                return
        self.wake.set()

    async def writer(self):
        try:
            while not self.ws.closed:
                await self.wake.wait()
                self.wake.clear()
                while not self.queue.empty():
                    await asyncio.wait_for(self.ws.send_json(self.queue.get_nowait()), 5)
                message, self.snapshot = self.snapshot, None
                if message is not None:
                    await asyncio.wait_for(self.ws.send_json(message), 5)
        except (ConnectionError, asyncio.TimeoutError):
            await self.ws.close(code=1013, message=b"Slow consumer")


class Lobby:
    def __init__(self):
        self.peers = {}
        self.games = {}
        self.tick = 0

    def listing(self):
        return [{k: v for k, v in game.items() if k != "members"}
                | {"count": len(game["members"])} for game in self.games.values()]

    def publish(self):
        message = {"type": "lobby", "games": self.listing()}
        for peer in list(self.peers.values()):
            peer.send(message)

    def leave(self, peer, notify=True):
        game = self.games.get(peer.game)
        if game:
            game["members"].pop(peer.id, None)
            if not game["members"]:
                del self.games[game["id"]]
            elif game["host"] == peer.id:
                game["host"] = next(iter(game["members"]))
        peer.game = peer.member = None
        peer.snapshot = None
        peer.sequence = -1
        if notify:
            peer.send({"type": "left"})

    def command(self, peer, message):
        if not isinstance(message, dict) or message.get("v") != 1:
            raise ValueError("Versión de protocolo no válida")
        now = time.monotonic()
        peer.tokens = min(90, peer.tokens + (now - peer.last) * 60)
        peer.last = now
        if peer.tokens < 1:
            raise ValueError("Demasiados mensajes")
        peer.tokens -= 1
        kind = message.get("type")
        if kind == "pose":
            if not peer.member:
                raise ValueError("No estás en una partida")
            seq = message.get("seq")
            if type(seq) is not int or not 0 <= seq <= 2**53 - 1:
                raise ValueError("Secuencia no válida")
            if seq <= peer.sequence:
                return
            tracking = message.get("tracking")
            if type(tracking) is not bool:
                raise ValueError("Tracking no válido")
            data = {key: pose(message.get(key)) for key in ("head", "left", "right")}
            if tracking and data["head"] is None:
                raise ValueError("Falta la pose del casco")
            peer.sequence = seq
            peer.member.update(data | {"tracking": tracking})
            peer.member["_updated"] = now
            return
        if kind == "leave":
            self.leave(peer)
            self.publish()
            return
        if kind not in ("create", "join"):
            raise ValueError("Acción desconocida")
        name = text(message.get("playerName"), 40)
        if kind == "create":
            if len(self.games) >= 512:
                raise ValueError("Servidor lleno")
            game = {"id": uuid.uuid4().hex, "name": text(message.get("name"), 80),
                    "host": peer.id, "place": place(message.get("place")), "members": {}}
        else:
            game = self.games.get(message.get("id")) if isinstance(message.get("id"), str) else None
            if game is None:
                raise ValueError("La partida ya no existe")
            if len(game["members"]) >= 32 and peer.id not in game["members"]:
                raise ValueError("Partida llena")
        slot = len(game["members"])
        self.leave(peer, notify=False)
        self.games[game["id"]] = game
        peer.game = game["id"]
        peer.member = {"id": peer.id, "name": name, "tracking": False,
                       "head": None, "left": None, "right": None, "_updated": now}
        game["members"][peer.id] = peer.member
        public = {k: v for k, v in game.items() if k != "members"}
        peer.send({"type": "joined", "playerId": peer.id,
                   "game": public | {"count": len(game["members"])},
                   "spawn": [0, 0, 0] if slot == 0 else [slot * 1.5, 0, 2]})
        self.publish()

    async def broadcast(self):
        while True:
            await asyncio.sleep(0.05)
            self.tick += 1
            now = time.monotonic()
            for game in list(self.games.values()):
                members = []
                for member in game["members"].values():
                    member = dict(member)
                    if now - member.pop("_updated") > 1:
                        member["tracking"] = False
                    members.append(member)
                message = {"type": "snapshot", "gameId": game["id"],
                           "tick": self.tick, "members": members}
                for player_id in list(game["members"]):
                    peer = self.peers.get(player_id)
                    if peer:
                        peer.send(message, snapshot=True)


def create_app():
    app = web.Application(client_max_size=16384)
    lobby = Lobby()
    app["lobby"] = lobby

    async def socket(request):
        origin = request.headers.get("Origin")
        allowed = set(filter(None, os.getenv("NABLA_ONLINE_ORIGINS", "").split(",")))
        if origin and origin not in allowed and urlsplit(origin).netloc != request.host:
            raise web.HTTPForbidden(text="Origin not allowed")
        if len(lobby.peers) >= 256:
            raise web.HTTPServiceUnavailable()
        ws = web.WebSocketResponse(heartbeat=15, max_msg_size=16384, compress=False)
        await ws.prepare(request)
        peer = Peer(ws)
        lobby.peers[peer.id] = peer
        writer = asyncio.create_task(peer.writer())
        peer.send({"type": "lobby", "games": lobby.listing()})
        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    try:
                        lobby.command(peer, json.loads(msg.data))
                    except (ValueError, TypeError, KeyError):
                        peer.send({"type": "error", "message": "Solicitud no válida o partida no disponible"})
                elif msg.type == WSMsgType.ERROR:
                    break
        finally:
            lobby.leave(peer, notify=False)
            lobby.peers.pop(peer.id, None)
            lobby.publish()
            writer.cancel()
            with contextlib.suppress(asyncio.CancelledError, ConnectionError, asyncio.TimeoutError):
                await writer
        return ws

    async def lifetime(app):
        task = asyncio.create_task(lobby.broadcast())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        await asyncio.gather(*(peer.ws.close() for peer in list(lobby.peers.values())))

    app.router.add_get("/online/ws", socket)
    app.cleanup_ctx.append(lifetime)
    return app


if __name__ == "__main__":
    web.run_app(create_app(), host=os.getenv("NABLA_ONLINE_BIND", "127.0.0.1"),
                port=int(os.getenv("NABLA_ONLINE_PORT", "8789")))
