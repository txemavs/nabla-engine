# Online sessions: first PC / Quest presence pilot

This pilot adds an explicit online lobby to the existing browser and AR hosts.
It implements creation, a list of **all active games** on the connected service,
joining, leaving and remote head/controller poses. It advances #148.

## Run

For the existing development stack, run:

```sh
docker compose -f compose.dev.yaml up --build
```

The new online service has no published Docker port; the development gateway and
Vite proxy forward /online/ws. The gateway retains its existing loopback binding.
Use the existing trusted HTTPS setup for Quest; changing this service does not
expose the gateway on the LAN or configure a production deployment.

For a native development server:

```sh
python -m venv .venv-online
.venv-online/bin/python -m pip install -r services/online/requirements.txt
.venv-online/bin/python services/online/server.py
npm run build
npm run dev
```

On Windows use .venv-online\Scripts\python.exe instead of the POSIX interpreter
path. Existing NABLA_HTTPS_CERT and NABLA_HTTPS_KEY settings still apply to Vite.
Both PC and Quest must open the same host. Vite forwards WSS to the Python service.
NABLA_ONLINE_UPSTREAM changes the internal proxy target (default http://127.0.0.1:8789).
A deployed host must proxy /online/ws to this service with WebSocket upgrades and
the original Host header. Use NABLA_ONLINE_ORIGINS for an explicit comma-separated
allowlist if the public origin differs. Do not configure a wildcard.

## Use

1. On screen, open **Online · partidas**. Choose a player/game name and connect.
2. Stand at the desired starting point and face forward. Select
   **Iniciar sesión online aquí**. The session stores the creator's place metadata.
3. On the other device, connect to the same service and select a game in the list.
   No geographic/proximity filter is applied.
4. In the immersive monitor use **Opciones → Online · partidas**. The list is
   paginated four games at a time, with every game reachable.
5. Walk, turn or crouch in Quest. The other client shows a blue head with a white
   forward marker and both controllers when tracked.
6. Leave explicitly, or close the page. A departing host transfers lobby ownership
   to a remaining member; the game disappears only when its last member leaves.

Online is opt-in: loading the game creates UI but opens no network connection.
A failed connection can be retried explicitly. Disconnecting clears remote poses;
it does not silently recreate a game. This pilot uses anonymous per-connection
identities and is intended for controlled testing.

## Coordinates and scope

Each join establishes a local floor and yaw reference. One simulation metre is
one session metre. The creator occupies the session origin; joiners receive
separate initial offsets. Reference-space reset compensation remains owned by the
existing XRSessionController. Tracking loss is transmitted, and a one-second
server timeout marks stale participants untracked.

The session stores room/world kind, label, creator origin and optional geographic
position. This is a **local rendezvous frame**, not automatic geographic travel:
joining does not reload another terrain, teleport a vehicle or align two physical
rooms. PC represents its view-camera pose in this initial observer pilot.
AR room meshes, map content, physics, inventory and weapon results remain local.
Creating a game does not upload a room scan. Those features require separate,
versioned world-content and authority contracts before shared combat.

The service owns session membership and assigns player IDs. Pose reports are
client observations, not proof of movement or hits. Combat must add validated
weapon actions, shared colliders, damage and server authority before using these
avatars as targets.

## Protocol and lifecycle

Version 1 JSON over WSS: create/join/leave commands, lobby updates, joined/left
acknowledgements, sequenced pose reports, and snapshots with game ID/server tick.
Unknown versions, malformed values and non-finite coordinates are rejected.
State never crosses game membership. Clients discard old ticks and snapshots for
a previous game; the service ignores old input sequences.

A single service process owns active games. State is intentionally ephemeral:
restart removes sessions. PostgreSQL/PostGIS persistence from #148 remains a
later phase. Do not run multiple independent workers behind a load balancer.

Tracking is sent at up to 20 Hz, independently of the render/physics rate. The
service broadcasts at 20 Hz. Snapshot queues retain only the newest unsent state;
control queues are bounded and slow consumers are disconnected. Runtime resource
limits are 256 connections, 512 games, 32 participants per game, 16 KiB inbound
messages, and 60 inbound messages/second with a 90-message burst per connection.
These are pilot resource bounds, not measured engine capacity or a universal
nearest-neighbour rule.

## Validation

```sh
npx vitest run test/runtime/online.test.ts
python -m unittest discover -s services/online
npm run check
node scripts/check-package.mjs
```

The Python tests include actual WebSocket clients, game isolation, host departure,
pose replication, origin checks and invalid data. Client tests cover protocol
validation, pending membership, stale snapshots and backpressure.

Device acceptance remains manual: PC creates and Quest joins; reverse the roles;
walk/turn/crouch; remove a controller; suspend tracking and recover; disconnect
either participant; verify every active game is listed and empty games disappear.
Measure latency and headset frame time in that trial.
