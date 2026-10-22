# Combat: character damage

Engine side of weapon damage on characters: hit zones on the body skeleton, health, hit
reactions, death and respawn. Code:

- `src/simulation/combat/damage.ts`: the rules (pure, no three.js; the relay can import it).
- `src/render/entity/hit-volumes.ts`: the hit capsules on a skinned body.
- `src/runtime/combat.ts`: `runtime.combat` (also `CombatHitReport` type), targets, shot resolution, network hooks.
- `src/ui/combat-hud.ts` and `src/ui/styles/combat.css`: the health bar, hit flash and death
  notice (tokens `--nabla-color-health`, `--nabla-color-health-low`, `--nabla-hit-flash`,
  `--nabla-health-width`).

## Rules

|         |                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health  | 100 (`MAX_HEALTH`)                                                                                                                                  |
| Damage  | weapon base × zone multiplier, rounded (`zoneDamage`)                                                                                               |
| Death   | at 0; hits on the dead are ignored                                                                                                                  |
| Respawn | 5 s after death (`RESPAWN_DELAY_S`), full health, at the scenario `spawn` entity (on the terrain ground), else where the player first stood on foot |

### Hit zones (`HIT_ZONES`)

Data, not per-body code: each zone names skeleton bones by the body asset contract (mixamorig
bone names, any prefix such as `mixamorig:` or `mixamorig`). Every named bone gets a capsule
from the bone to the mean of its child bones; fingers, toes and end bones have none.

| Zone id | Multiplier | Bones                                     | Radius  |
| ------- | ---------- | ----------------------------------------- | ------- |
| `head`  | ×4         | Head                                      | 0.11 m  |
| `neck`  | ×2.5       | Neck                                      | 0.065 m |
| `torso` | ×1         | Hips, Spine, Spine1, Spine2               | 0.15 m  |
| `arm`   | ×0.6       | Shoulder, Arm, ForeArm, Hand (both sides) | 0.055 m |
| `leg`   | ×0.75      | UpLeg, Leg, Foot (both sides)             | 0.075 m |

Capsules overlap at the joints. Among capsules entered within 0.2 m of the first entry, the one
whose bone axis the ray passes closest to (relative to its radius) wins, so a neck shot is a
neck hit and not chest.

### Weapon damage

Presets carry `damage` (base, one hit). Without it, `DEFAULT_BASE_DAMAGE` by kind applies:
firearm 20, bow 35, melee 30, prop and placeholder 0.

| Preset                          | Base | Head           | Torso        |
| ------------------------------- | ---- | -------------- | ------------ |
| `hk-compact` (USP Compact 9 mm) | 25   | 100 (one shot) | 25 (4 shots) |
| `mp5` (9 mm, automatic)         | 22   | 88             | 22           |
| `arco` (bow, arrow)             | 40   | 100            | 40           |
| `katana` (melee)                | 45   | 100            | 45           |

Bullets (ballistic trace) and legacy hitscan shots, arrows in flight and melee swings all go
through `combat.shotQuery(...)`, which wraps `Simulation.shoot`. The nearer of the world hit and
the character hit wins, so walls cover. A character hit returns entity id `character:<id>`.

## Reactions

- **Flinch**: the hit bone turns away from the shot, up to about 0.6 rad for big hits, over
  0.3 s. It is added on top of the animation (`PlayerBody.flinch`). The shooter shows it at
  once; other clients show it when the relay's health drop arrives.
- **Hit flash**: a red vignette on the victim's screen.
- **Health bar**: bottom centre of the HUD, red under 30 %.
- **Death**: the body collapses away from the shot in 0.7 s (`PlayerBody.collapseFrom`) and
  stops animating. The local player loses input and weapons; the HUD counts down the respawn.
  `PlayerBody.revive()` stands it up again.

## Offline and the test dummy

With no network host, this client is the authority: `runtime.combat` applies damage and runs
the respawn timers. Objects › Weapon › **Spawn test dummy** (`runtime.spawnCombatDummy()`) puts
a prota body 3 m ahead, facing the player. Dummies are `offline` targets, never networked, and
they respawn where they stood. Use `runtime.clearCombatDummies()` to remove them.

## Network contract (Pepe)

Shape: **the shooter sends the hit; the relay applies the damage, owns health and broadcasts
reliably; health is in the join snapshot.**

### Wiring on the client (`euskadi-net.ts`)

```ts
const combat = runtime.combat
combat.setLocalId(myPeerId) // the local player's target id = its peer id

// Each remote player's body, the same body you create with playerBodyRig.create():
combat.addTarget(peerId, body) // on join
combat.removeTarget(peerId) // on leave

// Shooter → relay (reliable). Setting onHit switches networked targets to relay authority.
combat.onHit = (hit: CombatHitReport) => send({ type: 'hit', ...hit })

// Relay → every client (reliable):
on('health', (m) =>
  combat.applyHealth(m.targetId, m.health, {
    zone: m.zone,
    direction: m.direction,
    shooterId: m.shooterId,
  }),
)
on('death', (m) => combat.applyDeath(m.targetId, { direction: m.direction }))
on('respawn', (m) => combat.applyRespawn(m.targetId, m.position)) // position optional, feet, sim world

// Join snapshot: health per peer
for (const [id, health] of Object.entries(snapshot.health)) combat.applyHealth(id, health)
```

`CombatHitReport` (what `onHit` gives you, all plain JSON):

```ts
{
  targetId: string // the victim's peer id
  zone: 'head' | 'neck' | 'torso' | 'arm' | 'leg'
  weapon: string // preset id, e.g. 'hk-compact', 'arco'
  damage: number // base × zone, computed by the shooter
  origin: [x, y, z] // shot origin, simulation-world metres
  direction: [x, y, z] // unit
  point: [x, y, z] // entry point on the body
  shooterId: string
}
```

### Relay

The relay can import the rules without three.js:

```ts
import { HealthLedger, zoneDamage, RESPAWN_DELAY_S } from '@nabla/engine/combat'

const ledger = new HealthLedger()
onMessage('hit', (hit, from) => {
  if (hit.shooterId !== from.id || ledger.get(hit.targetId).dead) return
  const damage = clamp(hit.damage, 0, 400) // or recompute: zoneDamage(baseFor(hit.weapon), hit.zone)
  const r = ledger.damage(hit.targetId, damage, nowSeconds())
  broadcastReliable({
    type: 'health',
    targetId: hit.targetId,
    health: r.health,
    zone: hit.zone,
    direction: hit.direction,
    shooterId: hit.shooterId,
  })
  if (r.died) broadcastReliable({ type: 'death', targetId: hit.targetId, direction: hit.direction })
})
setInterval(() => {
  for (const id of ledger.due(nowSeconds())) {
    ledger.respawn(id)
    broadcastReliable({ type: 'respawn', targetId: id /*, position */ })
  }
}, 250)
// Join snapshot: { ..., health: ledger.snapshot() }
```

Notes:

- Online, a hit on a networked target changes nothing locally except the flinch, until the
  relay answers. The victim's client applies its own respawn on `respawn`: it relocates the
  local player to its spawn, or to `position` when given.
- Without `onHit` (offline, or a page with no net), damage is local, as above.
- Lag compensation is not done: the shooter's view of the target decides the zone, and the
  relay trusts it within the clamp.
