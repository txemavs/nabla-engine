import asyncio
import unittest

from aiohttp.test_utils import TestClient, TestServer
from server import Lobby, Peer, create_app, pose, place


PLACE = {"kind": "room", "label": "Sala", "origin": [0, 0, 0], "geography": None}


class FakeSocket:
    closed = False

    async def close(self, **_):
        self.closed = True


class LobbyTests(unittest.TestCase):
    def setUp(self):
        self.lobby = Lobby()
        self.a, self.b, self.c = [Peer(FakeSocket()) for _ in range(3)]
        self.lobby.peers = {p.id: p for p in (self.a, self.b, self.c)}

    def create(self, peer, name="Partida"):
        self.lobby.command(peer, {"v": 1, "type": "create", "name": name,
                                  "playerName": "Jugador", "place": PLACE})
        return peer.game

    def test_all_games_and_isolation(self):
        first = self.create(self.a)
        second = self.create(self.c, "Otra")
        self.assertEqual(len(self.lobby.listing()), 2)
        self.lobby.command(self.b, {"v": 1, "type": "join", "id": first, "playerName": "B"})
        self.assertEqual(set(self.lobby.games[first]["members"]), {self.a.id, self.b.id})
        self.assertEqual(set(self.lobby.games[second]["members"]), {self.c.id})

    def test_departure_transfers_host_and_removes_only_empty_games(self):
        game = self.create(self.a)
        self.lobby.command(self.b, {"v": 1, "type": "join", "id": game, "playerName": "B"})
        self.lobby.leave(self.a)
        self.assertEqual(self.lobby.games[game]["host"], self.b.id)
        self.lobby.leave(self.b)
        self.assertEqual(self.lobby.listing(), [])

    def test_invalid_join_does_not_leave_current_game(self):
        game = self.create(self.a)
        with self.assertRaises(ValueError):
            self.lobby.command(self.a, {"v": 1, "type": "join", "id": "missing", "playerName": "A"})
        self.assertEqual(self.a.game, game)

    def test_pose_is_owned_by_connection_and_sequence_is_monotonic(self):
        self.create(self.a)
        data = {"v": 1, "type": "pose", "seq": 2, "tracking": True,
                "id": self.b.id, "head": {"position": [1, 2, 3], "rotation": [0, 0, 0, 1]},
                "left": None, "right": None}
        self.lobby.command(self.a, data)
        self.lobby.command(self.a, data | {"seq": 1, "head": None})
        self.assertEqual(self.a.member["head"]["position"], [1, 2, 3])
        self.assertIsNone(self.b.member)

    def test_invalid_numbers_and_unsupported_protocol(self):
        for invalid in (float("nan"), float("inf"), True):
            with self.assertRaises(ValueError):
                pose({"position": [invalid, 0, 0], "rotation": [0, 0, 0, 1]})
        with self.assertRaises(ValueError):
            place(PLACE | {"geography": {"latitude": 100, "longitude": 0, "altitude": 0}})
        with self.assertRaises(ValueError):
            self.lobby.command(self.a, {"v": 2, "type": "leave"})

    def test_snapshot_queue_retains_latest_only(self):
        self.a.send({"tick": 1}, snapshot=True)
        self.a.send({"tick": 2}, snapshot=True)
        self.assertEqual(self.a.snapshot, {"tick": 2})
        self.assertTrue(self.a.queue.empty())


class SocketTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = TestClient(TestServer(create_app()))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def until(self, socket, kind):
        for _ in range(30):
            message = await asyncio.wait_for(socket.receive_json(), 2)
            if message["type"] == kind:
                return message
        self.fail("Expected " + kind)

    async def test_two_clients_see_lobby_membership_and_live_pose(self):
        a = await self.client.ws_connect("/online/ws")
        b = await self.client.ws_connect("/online/ws")
        await self.until(a, "lobby")
        await self.until(b, "lobby")
        await a.send_json({"v": 1, "type": "create", "name": "AR", "playerName": "A", "place": PLACE})
        joined = await self.until(a, "joined")
        listing = await self.until(b, "lobby")
        self.assertEqual(listing["games"][0]["id"], joined["game"]["id"])
        await b.send_json({"v": 1, "type": "join", "id": joined["game"]["id"], "playerName": "B"})
        await self.until(b, "joined")
        await a.send_json({"v": 1, "type": "pose", "seq": 1, "tracking": True,
                          "head": {"position": [1, 1.7, 2], "rotation": [0, 0, 0, 1]},
                          "left": None, "right": None})
        for _ in range(20):
            snapshot = await self.until(b, "snapshot")
            if any(m["tracking"] for m in snapshot["members"]):
                break
        observed = next(m for m in snapshot["members"] if m["id"] == joined["playerId"])
        self.assertEqual(observed["head"]["position"], [1, 1.7, 2])
        await a.close()
        listing = await self.until(b, "lobby")
        self.assertEqual(listing["games"][0]["count"], 1)
        self.assertNotEqual(listing["games"][0]["host"], joined["playerId"])
        await b.close()

    async def test_foreign_browser_origin_is_rejected(self):
        response = await self.client.get("/online/ws", headers={"Origin": "https://unrelated.invalid"})
        self.assertEqual(response.status, 403)


if __name__ == "__main__":
    unittest.main()
