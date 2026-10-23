# Continuous multiplayer worlds (protocol 2)

The relay now supports continuous instances alongside legacy protocol-1 rooms. An instance
may be an entire planet, a large local map, or a user-hosted GLB match. Every client retains
one connection and identity while its **observer set** changes. There is no spatial room
switching. Persistence, account login and multi-server region handoff are not implemented.

## Three independent contracts

1. **Instance id** (`room` on the wire for compatibility): identifies a particular match or
   shared world. Different matches on the same GLB must use different instance ids.
2. **Content id** (`world.content`): an agreed immutable map/version identifier, preferably
   a SHA-256 digest from the publisher. All clients in an instance must send the same id.
   The relay checks equality; it does not download or verify GLB bytes. A host sharing a GLB
   must provide its asset URL/bytes, content digest and instance id out of band.
3. **Coordinate space** (`world.space`): `local` uses shared scene metres (+Y up); `planet`
   uses the engine's spherical ECEF metres (+Y north, longitude 0 on +X, 90°E on -Z;
   mean Earth radius 6371000 m). This is the engine convention, not standard WGS84 ellipsoidal
   ECEF axes. Local GLBs require no geographic anchor. Clients must agree on model scale,
   axes, placement and content version. Planet clients may have different local origins.

Instance ids accept 1–64 ASCII letters/digits/underscore/hyphen. Content ids accept 1–64
letters/digits/underscore/dot/colon/hyphen (a raw SHA-256 hex digest fits). A mismatch is
rejected explicitly, never silently placed in a different world. These identifiers isolate
instances; they are not passwords or access-control rules.

## Client integration

Use the existing `SnapshotSync` hooks with its new `world` option. No option means the
existing protocol-1 behavior. A protocol-2 client never silently falls back to protocol 1.
Deploy the updated relay before enabling the option in an application host.

```ts
import { SnapshotSync, NetWorker, browserWorldSession } from '@nabla/engine/net'

const world = {
  space: 'planet' as const,
  content: 'earth-content-v1', // Host-owned published content contract.
  origin: scene.geography, // The simulation origin, NOT the floating render origin.
  session: browserWorldSession(`${relayUrl}|${instanceId}|earth-content-v1`),
}

const sync = new SnapshotSync({
  ...existingGameplayHooks,
  transport: new NetWorker(relayUrl),
  room: instanceId,
  world,
  localPosition: () => simulation.player.position,
  onError: (message, code) => showConnectionError(message, code),
})
```

For a GLB use `world: { space: 'local', content: modelSha256, session }`; omit `origin`.
Content identity includes agreed transforms/gameplay version where these change the scene.
Host/join UI and GLB file transfer remain application responsibilities. The user hosting a
match is not automatically a physics authority for every other player.

`SnapshotSync` transforms vehicle positions, orientations, linear/angular velocities,
avatar heading/aim, entity poses and the standard fire/hit/health/respawn spatial fields at
the network boundary. Gameplay hooks continue receiving local simulation coordinates.
Body-relative held-item poses and wheel data remain unchanged. The supplied planetary
origin is fixed for the sync lifetime; floating-origin render shifts must not alter it.
Recreate the sync with the same session if the simulation's actual coordinate frame changes.
An observer without a local position waits to join instead of receiving the whole world.

Protocol-2 visibility supersedes the client's legacy `interest` option. `switchRoom()` is
rejected for a continuous world: create another sync/session scope to join a different
instance. A spatial cell change never uses that API.

## Wire and identity lifecycle

```json
{
  "type": "join",
  "version": 2,
  "room": "my-match",
  "world": { "space": "local", "content": "model-v1" },
  "position": [0, 1, 0],
  "meta": { "actor": "default:blue" }
}
```

The server issues a UUID peer id and a random 256-bit bearer `resume` token in `welcome`
(with `version: 2`). Supply that token on the next join to recover the same peer, color,
ownership and health while the session remains retained. A token is scoped to its instance;
simultaneous connections using it are rejected (`session-active`). Never put it in URLs,
public profiles or logs. Transport must use WSS in deployment. This is possession-based
session recovery, not authenticated accounts.

Sessions stay in server memory for 120 seconds after disconnection by default. A real
disconnect or explicit `leave` removes the observer and releases driven vehicles, preserving
their rest poses. Health/ownership remain until expiry. AOI exits do neither. An expired or
unknown token returns `session-expired`; the client clears it and retries once as a new peer.
Server restart loses all tokens and worlds. Once the last retained session expires, its
instance and entities are discarded. `browserWorldSession` optionally keeps only the token
in per-tab sessionStorage across reloads; world state is never persisted. Without it, reuse
a `WorldSession` object for in-memory reconnect/recreation. Storage keys must include the
relay endpoint, instance and content identity to avoid accidental reuse.

Snapshots retain sequence/timestamp fields; sequences must increase on a connection and
may restart on resume. Planetary avatars add `q` (ECEF body quaternion) and optional `u`
(ECEF aim direction). Standard event positional/directional fields also use ECEF in planet
mode. Arbitrary custom event coordinate formats are not inferred or supported in this phase.

## Observer sets and shared entities

The server stores positions in a sparse 3D hash grid. This works for both scene coordinates
and planetary ECEF, including the date line/poles, without latitude special cases. Distance
is 3D straight-line distance in metres (planetary chord distance); altitude matters.

- Default radius: 250 m. At most **64 other players per client**, not 64 per instance.
- Recompute every 200 ms, plus membership/entity changes. Previously visible peers get up
  to 25 m (or 10% of the radius) of retention/ranking preference to reduce boundary churn.
  It is a stable nearby selection, not an exact nearest-64 promise on every packet.
- `visible` announces peer metadata, followed by authoritative health and its latest full
  snapshot when one exists. `hidden` removes only that client's local representation.
  Snapshot forwarding uses reverse observer sets and checks distance between AOI ticks.
- Observer sets can be asymmetric in crowds. Hits require mutual visibility, range and a
  living attacker. A culled player cannot damage an unseen opponent. Combat still trusts
  reported damage and does not validate geometry, ammunition or movement plausibility.
- Shared entities have a separate spatial index and a maximum of 128 visible records per
  observer. A driven entity is visible only if its driver is visible (or is the observer).
  A player's own driven entity stays subscribed. One driver can hold one entity at a time.
- `entity.hidden` removes a local view; `entity.gone` records an actual removal. Wire
  visibility exits never change ownership or release control. Use `SharedEntityHooks.hidden`
  to remove host UI/cache entries without applying pickup/deletion gameplay; `removed` is
  reserved for removal/legacy teardown. `despawn` releases the local representation in both.
- Protocol-2 claims/releases await server outcomes before changing local ownership. Newly
  published entity ids include a random suffix to avoid collisions when a stable identity
  reconnects. Application-specified ids must likewise be stable and globally unique per world.

Claim/pickup requests require a known entity within 15 m; new spawns and release poses must
be within 50 m. Only owners may remove non-item entities; nearby items use first-accepted
pickup semantics. These are minimal interaction guards, not full anti-cheat. Each instance
currently allows 4096 entities, each identity 16 owned entities, and 16384 removal tombstones.
When the tombstone budget fills, additional deletions are rejected rather than resurrecting
removed ids. Idle worlds and abandoned ownership need a retention policy before persistence.

Only standard `fire`, `reload`, `hit` and entity requests are accepted in protocol 2. The
server emits health/death/respawn/entity outcomes. There is no global event broadcast across
all planetary clients. Existing protocol-1 rooms keep their prior semantics, isolated from
protocol-2 worlds even when names match.

## Deployment limits and validation

| Environment variable   | Default | Meaning                                                          |
| ---------------------- | ------- | ---------------------------------------------------------------- |
| `WORLD_RADIUS`         | 250     | Observer radius in metres, positive integer.                     |
| `WORLD_MAX_PEERS`      | 64      | Maximum visible other players, 1–64.                             |
| `WORLD_MAX_PLAYERS`    | 4096    | Global connected protocol-2 player admission limit.              |
| `WORLD_MAX_SESSIONS`   | 8192    | Global retained protocol-2 sessions including disconnected ones. |
| `WORLD_SESSION_TTL_MS` | 120000  | Disconnected session retention.                                  |
| `WORLD_TICK_MS`        | 200     | AOI, session-expiry and respawn maintenance interval.            |

These values are safety/admission limits, **not measured supported player counts**. The
single process owns all authority. Crowded cells still require candidate sorting; entity
changes also trigger AOI refresh. Profile realistic movement and density before raising
admission limits or adding regional workers. Existing heartbeat/backpressure safeguards
apply to protocol 2 as well. `/health` adds `worlds` and connected `players` counts.

Validation commands:

```sh
npm test --prefix services/relay
npx vitest run test/net
npx tsc -p tsconfig.build.json --noEmit
```

Tests exercise 70 simultaneous clients with a per-client cap of 64, traversal without
rejoining/control loss, resume and expiry, content/instance isolation, planetary date-line
neighbours, real relay-to-client conversion between geographic origins, and local GLB space.
This is functional integration coverage, not a load benchmark.

The Euskadi host also enables protocol 2 on its terrain page and GLB scenario page. Terrain
uses the loaded scene's geographical origin; GLBs use local metres and versioned content ids.
`?scenario=multiplayer-yard&room=my-match` selects the reference GLB independently of the
instance. The host's `docs/continuous-multiplayer.md` describes publication and local checks.

During a temporary protocol-2 disconnect the client retains shared-object/local-object
associations, but pauses their updates. The welcome contains an initial bounded set of nearby
parked entities; subsequent visibility events add entities driven by newly visible peers.
Reconciliation removes records no longer present and keeps surviving local objects. This
prevents a reconnecting driver from publishing a duplicate vehicle. If the session expired,
the new identity clears these associations. A socket disconnect releases control, so a
resuming client must request its vehicle again and may lose that claim to another player.

On 2026-10-23, three real Edge clients were exercised on both Euskadi's Atlas terrain and a
local GLB: proximity exit/re-entry and identity-preserving reconnect passed. The GLB run also
used keyboard vehicle entry/exit to transfer a shared car between players, checked that an
observer leaving its area did not release the driver, resumed while driving another player's
car without duplication, and changed scenarios through the host picker. These browser checks
do not establish production capacity or durable persistence.
