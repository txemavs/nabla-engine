# Nabla room relay

A dependency-light WebSocket relay for the engine's snapshot sync (`@nabla/engine/net`).
It holds no game state: peers `join` a room, receive a `welcome` with their peer id, slot,
colour and the current members, and every `snapshot` or `event` is forwarded to the other
members with the sender's peer id stamped by the relay.

**Protocol version: 1** (`PROTOCOL_VERSION` in `server.mjs`, wire format in
`src/net/protocol.ts`). A `join` with another version gets an `error`.

## Run locally

Requires Node 20 or newer.

```sh
cd services/relay
npm ci
npm test                      # also run by CI: root `npm run check` -> `npm run test:relay`
npm start                     # ws://localhost:8787, GET http://localhost:8787/health -> 200
```

With Docker (plain `ws://`, no TLS):

```sh
docker build -t nabla-relay services/relay
docker run --rm -p 8787:8787 nabla-relay
```

## Configuration

Environment variables only; there are no config files and no secrets.

| Variable          | Default                                         | Meaning                                                                                                                                                                                |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`            | `8787`                                          | Listening port (HTTP `/health` and WebSocket upgrade).                                                                                                                                 |
| `HOST`            | `0.0.0.0`                                       | Listening address.                                                                                                                                                                     |
| `ALLOWED_ORIGINS` | `https://euskadi.online,http://localhost:10001` | Comma-separated browser origins allowed to open a WebSocket. Others get HTTP 403. `*` allows any. Requests without an `Origin` header (non-browser clients, tests) are always allowed. |
| `MAX_ROOMS`       | `256`                                           | Maximum open rooms. A join that would open another room gets `error: Too many rooms`.                                                                                                  |
| `MAX_ROOM`        | `64`                                            | Maximum peers per room (`error: Room is full`).                                                                                                                                        |
| `MAX_FRAME`       | `4096`                                          | Maximum frame size in bytes.                                                                                                                                                           |
| `MAX_RATE`        | `60`                                            | Frames per second per peer; extra frames are dropped.                                                                                                                                  |
| `MAX_EVENTS`      | `15`                                            | Game events per second per peer; extra events are dropped.                                                                                                                             |
| `RADIUS`          | `250`                                           | Interest radius in metres (horizontal); `0` forwards to everyone.                                                                                                                      |
| `POSITION_TTL`    | `3000`                                          | Milliseconds after a member's last snapshot before its position is forgotten.                                                                                                          |
| `PALETTE`         | eight car colours                               | Comma-separated `#rrggbb` colours assigned by slot.                                                                                                                                    |

Interest management: each snapshot goes only to members within `RADIUS` of its sender's last
position; a member without a fresh position gets everything. Clients show/hide peers inside
that radius (`SnapshotSync` `interest`, e.g. 200/220 m), so the relay radius must be larger
than the client hide distance.

## Production

Serve it behind a TLS reverse proxy (`wss://`), for example nginx `location /relay` with
WebSocket upgrade headers and a long `proxy_read_timeout`. Browsers block `ws://` from HTTPS
pages.
