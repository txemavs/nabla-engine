# Nabla room relay

A dependency-light WebSocket relay for the engine's snapshot sync (`@nabla/engine/net`).
It holds no game state: peers `join` a room, receive a `welcome` with their peer id and the
current members, and every `snapshot` is forwarded to the other members with the sender's
peer id stamped by the relay. Protocol: `src/net/protocol.ts`.

```sh
cd services/relay && npm install && npm test
PORT=10003 npm start                          # ws://localhost:10003, GET /health
docker build -t nabla-relay . && docker run --rm -p 10003:10003 nabla-relay
```

Environment: `PORT` (10003), `HOST` (0.0.0.0), `MAX_ROOM` (8), `MAX_FRAME` bytes (4096),
`MAX_RATE` frames per second per peer (60).

Serve it behind TLS (`wss://`) when the game page is HTTPS; browsers block `ws://` from
secure pages.
