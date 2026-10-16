"""Socket tests use an instrumented actuator; no physical FFB claims."""
import asyncio
import importlib.util
import json
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import bridge


@unittest.skipUnless(importlib.util.find_spec('websockets'), 'Optional bridge dependencies not installed')
class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_authentication_origin_watchdog_and_disconnect(self):
        from websockets.asyncio.client import connect
        from websockets.exceptions import InvalidStatus
        forces = []
        class Wheel:
            def __init__(self, *_): pass
            def force(self, value): forces.append(value)
            def stop(self): forces.append(0)
            def close(self): self.stop()
        args = SimpleNamespace(device=0, max_force=.3, origin=['http://localhost:5195'],
                               cert=None, key=None, port=19876)
        with patch.object(bridge, 'SDLWheel', Wheel), patch.object(bridge.secrets, 'token_urlsafe', return_value='test-secret'):
            server = asyncio.create_task(bridge.run(args))
            try:
                for _ in range(30):
                    try:
                        reader, writer = await asyncio.open_connection('127.0.0.1', args.port)
                        writer.close(); await writer.wait_closed()
                        break
                    except OSError:
                        await asyncio.sleep(.02)
                with self.assertRaises(InvalidStatus):
                    async with connect('ws://127.0.0.1:19876', origin='https://untrusted.invalid'):
                        pass
                async with connect('ws://127.0.0.1:19876', origin=args.origin[0]) as ws:
                    await ws.send(json.dumps({'type':'authenticate','token':'test-secret'}))
                    self.assertEqual(json.loads(await ws.recv())['type'], 'ready')
                    await ws.send(json.dumps({'type':'force','force':.9}))
                    await asyncio.sleep(.03)
                    self.assertEqual(forces[-1], .3)
                    await asyncio.sleep(.22)
                    self.assertEqual(forces[-1], 0)
                await asyncio.sleep(.02)
                self.assertEqual(forces[-1], 0)
            finally:
                server.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await server
