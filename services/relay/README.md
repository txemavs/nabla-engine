# Nabla room relay

Protocol 2 adds [continuous worlds](../../docs/continuous-world.md): a planetary world or
local GLB/map instance with stable resumable identities and up to 64 nearby players per
observer. Enable it with `SnapshotSync.world`; protocol-1 rooms below remain compatible.
The continuous-world contract documents coordinate conversion, content/instance isolation,
session retention, entity visibility and `WORLD_*` deployment limits. No disk persistence.

A dependency-light WebSocket relay for the engine's snapshot sync (`@nabla/engine/net`).
It forwards movement snapshots and owns in-memory room state: membership, character
health/respawn ledgers, shared entities and their claims. Peers `join` a room, receive a `welcome` with their peer id and the
current members, and every `snapshot` (a vehicle `state`, an on-foot `avatar` block
`{p, y, s, a}`, or both; older clients ignore state-less ones) is forwarded to the other
members with the sender's peer id stamped by the relay. Protocol: `src/net/protocol.ts`.

The relay does not run world physics or verify reported hits against geometry. It validates
requests and applies authoritative health/entity outcomes; ammunition remains client-owned.
Reload events require a valid slot, a living sender and the configured minimum interval.
See [game authority](../../docs/net.md) for request and outcome semantics.

```sh
cd services/relay && npm install && npm test
PORT=10003 npm start                          # ws://localhost:10003, GET /health
docker build -t nabla-relay . && docker run --rm -p 10003:10003 nabla-relay
```

Environment: `PORT` (10003), `HOST` (0.0.0.0), `MAX_ROOM` (64), `MAX_FRAME` bytes (4096),
`MAX_RATE` frames per second per peer (60), `MAX_EVENTS` per second per peer (15),
`RADIUS` metres (250; 0 forwards to everyone), `RELOAD_INTERVAL` seconds (0.5),
`RESPAWN_DELAY` seconds (5).

## Connection liveness and slow clients

Protocol 2 now supports correlated vehicle entry: `entity.claim {i,r}` receives
`entity.claim.result {i,r,ok,reason}` after the authoritative record on success. Clients
must remain on foot until confirmed. Stable authored entity IDs prevent duplicate vehicles;
late publications of moved/deleted objects receive `entity.unavailable` rather than creating
another object. See [the complete contract](../../docs/continuous-world.md#authored-vehicles-and-confirmed-entry).
Disconnect releases the seat immediately; resuming an identity does not reclaim an occupied
vehicle. State remains in memory, with no persistence across relay restarts.

Tests include 160 moving WebSocket clients, the 64-neighbour cap, simultaneous entry,
contested resume and late map publications. Population diagnostics are functional regression
results, not a supported production capacity measurement. CI installs this service's own
lockfile before running these tests and the engine integration tests.

The relay uses native WebSocket ping/pong control frames. Browsers answer automatically;
no JSON heartbeat message, client change or protocol-version bump is needed. Every
`HEARTBEAT_INTERVAL_MS` it pings each open connection. If the previous ping still has no
pong at the next tick, it terminates that connection. With the default 30-second interval,
a silent connection is normally detected within 30–60 seconds, subject to event-loop delays.
An idle player who answers pongs remains connected even without movement snapshots.

Outbound delivery is bounded **per socket**, using `ws.bufferedAmount` and the UTF-8 size
of the next message plus frame overhead. These are application/WebSocket queue limits,
not a bound on operating-system TCP buffers or an acknowledgement from the remote game.

| Variable                 | Default  | Meaning                                                                 |
| ------------------------ | -------- | ----------------------------------------------------------------------- |
| `HEARTBEAT_INTERVAL_MS`  | `30000`  | Ping interval and time allowed for its pong.                            |
| `OUTBOUND_SOFT_LIMIT`    | `65536`  | Bytes above which new movement snapshots are omitted.                   |
| `OUTBOUND_HARD_LIMIT`    | `262144` | Maximum queued application output in bytes.                             |
| `SLOW_CLIENT_TIMEOUT_MS` | `10000`  | Continuous observed time at or above the soft limit before termination. |

All four settings must be positive integers up to 2147483647, and the soft limit must be
strictly smaller than the hard limit. Invalid values fail startup. The corresponding
`startRelay` options are `heartbeatIntervalMs`, `outboundSoftLimit`, `outboundHardLimit`
and `slowClientTimeoutMs`.

- **Snapshots:** if enqueueing one would exceed the soft limit, omit it for that recipient.
  No additional snapshot backlog is kept. Once the connection drains, subsequent current
  snapshots flow normally; skipped historical positions are never replayed. Bytes already
  handed to the socket cannot be withdrawn. Healthy recipients continue receiving updates.
- **Events and membership messages:** continue in WebSocket order above the soft limit.
  If the next message would exceed the hard limit (including an oversized `welcome`),
  terminate the recipient instead of silently omitting a game outcome. This does not provide
  delivery acknowledgement or replay: a disconnected client must rejoin and synchronize.
  Keep the hard limit large enough for your maximum room/entity welcome snapshot.
- **Sustained congestion:** check queues at least once per second, independently of incoming
  messages. A queue remaining at or above the soft limit for the configured timeout is
  terminated, even if no more messages arrive. Observing it below that limit resets the timer.
  Scheduling delays can extend the timeout; it measures sampled queue pressure.

Heartbeat failures, queue limits/timeouts and socket send errors are logged as `disconnect`
with the room and reason. Termination bypasses a blocked write queue; it follows the existing
close cleanup: announce `left`, release driven entities, remove the peer's health, and remove
the room if empty. The client may observe an abnormal WebSocket close rather than a close
frame carrying the reason. `NetWorker` can reconnect; the direct `WebSocketTransport`
fallback does not automatically retry. Protocol 1 rejoining creates a new peer identity;
protocol 2 resumes the tab's retained session (see the continuous-world contract).

Both maintenance timers are cleared by `relay.close()`. The Docker image includes the
connection policy module. No active development/game server is required to run the tests.

`npm test` runs real WebSocket integration tests for heartbeat cleanup (including freeing
a driven vehicle), healthy idle clients and oversized reliable output. Deterministic socket
tests cover congestion, recovery, independent recipients, byte accounting, timeout reset
and write failures without depending on platform-specific TCP buffering. These tests are
not a production load benchmark.

Interest management: each snapshot goes only to members within `RADIUS` (horizontal) of its
sender's last position; a member that has not sent a position yet gets everything. Clients
show/hide peers inside that radius (`SnapshotSync` `interest`, e.g. 200/220 m), so the relay
radius must be larger than the client hide distance.

Serve it behind TLS (`wss://`) when the game page is HTTPS; browsers block `ws://` from
secure pages.
