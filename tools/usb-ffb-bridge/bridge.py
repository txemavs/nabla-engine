"""Optional PC-only SDL2 constant-force adapter. Input and physics stay in Engine.

Run with --list first. No force is generated until an allowed-origin client
supplies the one-use process token and enables feedback in the game.
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import ctypes
import json
import math
import secrets
import ssl
import time


class Protocol:
    """Transport-independent checks, also exercised without a physical wheel."""
    def __init__(self, token: str, maximum: float = 0.3):
        self.token = token
        self.maximum = min(1.0, max(0.0, maximum))
        self.authenticated = False
        self.last = 0.0

    def receive(self, text: str, now: float) -> float | None:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("Expected object")
        if not self.authenticated:
            if data.get("type") != "authenticate" or not isinstance(data.get("token"), str):
                raise ValueError("Authentication required")
            if not secrets.compare_digest(data["token"], self.token):
                raise ValueError("Invalid token")
            self.authenticated = True
            self.last = now
            return None
        force = data.get("force")
        if data.get("type") != "force" or isinstance(force, bool) or not isinstance(force, (float, int)) or not math.isfinite(force):
            raise ValueError("Invalid force")
        self.last = now
        return min(self.maximum, max(-self.maximum, force))

    def expired(self, now: float) -> bool:
        return now - self.last >= 0.15


class SDLWheel:
    def __init__(self, device: int, maximum: float):
        import sdl2
        self.sdl = sdl2
        self.joystick = self.haptic = None
        self.effect_id = -1
        if sdl2.SDL_Init(sdl2.SDL_INIT_JOYSTICK | sdl2.SDL_INIT_HAPTIC) != 0:
            raise RuntimeError(sdl2.SDL_GetError().decode())
        try:
            self.joystick = sdl2.SDL_JoystickOpen(device)
            if not self.joystick or not sdl2.SDL_JoystickIsHaptic(self.joystick):
                raise RuntimeError("Device has no SDL2 haptic capability")
            self.haptic = sdl2.SDL_HapticOpenFromJoystick(self.joystick)
            if not self.haptic:
                raise RuntimeError(sdl2.SDL_GetError().decode())
            capabilities = sdl2.SDL_HapticQuery(self.haptic)
            if not capabilities & sdl2.SDL_HAPTIC_CONSTANT:
                raise RuntimeError("Constant directional force is not supported")
            # Each effect lasts at most 200 ms even if Python stops servicing it.
            self.effect = sdl2.SDL_HapticEffect()
            self.effect.constant.type = sdl2.SDL_HAPTIC_CONSTANT
            self.effect.constant.direction.type = sdl2.SDL_HAPTIC_STEERING_AXIS
            self.effect.constant.length = 200
            self.effect.constant.attack_length = 10
            self.effect.constant.fade_length = 10
            self.effect.constant.level = 0
            self.maximum = min(1.0, max(0.0, maximum))
            self.effect_id = sdl2.SDL_HapticNewEffect(self.haptic, ctypes.byref(self.effect))
            if self.effect_id < 0:
                raise RuntimeError(sdl2.SDL_GetError().decode())
        except BaseException:
            self.close()
            raise

    def force(self, force: float):
        if not math.isfinite(force):
            force = 0.0
        force = min(self.maximum, max(-self.maximum, force))
        self.sdl.SDL_JoystickUpdate()
        if not self.sdl.SDL_JoystickGetAttached(self.joystick):
            self.stop()
            raise RuntimeError("Wheel disconnected")
        if force == 0:
            self.stop()
            return
        self.effect.constant.level = round(force * 32767)
        if self.sdl.SDL_HapticUpdateEffect(self.haptic, self.effect_id, ctypes.byref(self.effect)) < 0:
            self.stop()
            raise RuntimeError(self.sdl.SDL_GetError().decode())
        if self.sdl.SDL_HapticRunEffect(self.haptic, self.effect_id, 1) < 0:
            self.stop()
            raise RuntimeError(self.sdl.SDL_GetError().decode())

    def stop(self):
        if self.haptic:
            self.sdl.SDL_HapticStopAll(self.haptic)

    def close(self):
        self.stop()
        if self.haptic:
            if self.effect_id >= 0:
                self.sdl.SDL_HapticDestroyEffect(self.haptic, self.effect_id)
            self.sdl.SDL_HapticClose(self.haptic)
            self.haptic = None
        if self.joystick:
            self.sdl.SDL_JoystickClose(self.joystick)
            self.joystick = None
        self.sdl.SDL_Quit()


async def run(args):
    from websockets.asyncio.server import serve
    wheel = SDLWheel(args.device, args.max_force)
    token = secrets.token_urlsafe(32)
    print("FFB token (this process only):", token, flush=True)
    print("Allowed origins:", ", ".join(args.origin), flush=True)
    busy = False

    async def client(ws):
        nonlocal busy
        if busy:
            await ws.close(1013, "A controller already owns this wheel")
            return
        busy = True
        protocol = Protocol(token, args.max_force)
        try:
            # Authentication must arrive promptly; receive loop is bounded by watchdog.
            async with asyncio.timeout(5):
                value = protocol.receive(await ws.recv(), time.monotonic())
                assert value is None
            await ws.send(json.dumps({"type": "ready"}))
            while True:
                try:
                    text = await asyncio.wait_for(ws.recv(), timeout=0.05)
                except asyncio.TimeoutError:
                    if protocol.expired(time.monotonic()):
                        wheel.stop()
                    continue
                force = protocol.receive(text, time.monotonic())
                if force is not None:
                    wheel.force(force)
        except Exception:
            # Do not echo tokens or untrusted messages into logs.
            wheel.stop()
            with contextlib.suppress(Exception):
                await ws.close(1008, "FFB connection ended")
        finally:
            wheel.stop()
            busy = False

    tls = None
    if args.cert:
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(args.cert, args.key)
    try:
        # Loopback only, exact Origin allowlist, one owner, bounded messages/queue.
        async with serve(client, "127.0.0.1", args.port, origins=args.origin,
                         ssl=tls, max_size=1024, max_queue=2, ping_interval=5, ping_timeout=3):
            await asyncio.Future()
    finally:
        wheel.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--device", type=int)
    parser.add_argument("--port", type=int, default=9876)
    parser.add_argument("--max-force", type=float, default=0.3)
    parser.add_argument("--origin", action="append", default=[])
    parser.add_argument("--cert")
    parser.add_argument("--key")
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error("--cert and --key must be supplied together")
    if not math.isfinite(args.max_force) or not 0 <= args.max_force <= 1:
        parser.error("--max-force must be between 0 and 1")
    if args.list:
        import sdl2
        if sdl2.SDL_Init(sdl2.SDL_INIT_JOYSTICK | sdl2.SDL_INIT_HAPTIC) != 0:
            raise RuntimeError(sdl2.SDL_GetError().decode())
        try:
            for i in range(sdl2.SDL_NumJoysticks()):
                name = sdl2.SDL_JoystickNameForIndex(i)
                print(i, name.decode(errors="replace") if name else "Unknown")
        finally:
            sdl2.SDL_Quit()
        return
    if args.device is None or args.device < 0 or not args.origin:
        parser.error("Select --device from --list, and supply at least one exact --origin")
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
