# Nabla room relay

A dependency-light WebSocket relay for the engine's snapshot sync (`@nabla/engine/net`).
It holds no game state: peers `join` a room, receive a `welcome` with their peer id and the
current members, and every `snapshot` (a vehicle `state`, an on-foot `avatar` block
`{p, y, s, a}`, or both; older clients ignore state-less ones) is forwarded to the other
members with the sender's peer id stamped by the relay. Protocol: `src/net/protocol.ts`.

```sh
cd services/relay && npm install && npm test
PORT=10003 npm start                          # ws://localhost:10003, GET /health
docker build -t nabla-relay . && docker run --rm -p 10003:10003 nabla-relay
```

Environment: `PORT` (10003), `HOST` (0.0.0.0), `MAX_ROOM` (64), `MAX_FRAME` bytes (4096),
`MAX_RATE` frames per second per peer (60), `MAX_EVENTS` per second per peer (15),
`RADIUS` metres (250; 0 forwards to everyone).

Interest management: each snapshot goes only to members within `RADIUS` (horizontal) of its
sender's last position; a member that has not sent a position yet gets everything. Clients
show/hide peers inside that radius (`SnapshotSync` `interest`, e.g. 200/220 m), so the relay
radius must be larger than the client hide distance.

Serve it behind TLS (`wss://`) when the game page is HTTPS; browsers block `ws://` from
secure pages.
