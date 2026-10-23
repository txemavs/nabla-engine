# Net: game authority

`GameAuthority` (`src/net/authority.ts`) is the single decider for contested game state. Games
send requests and apply outcomes only from subscriptions, also for their own requests.
Request shapes and bounds live in `src/net/authority-schema.ts`, shared by both implementations.

- `RelayAuthority`: multiplayer; the relay (`services/relay`) decides.
- `LocalAuthority`: single player; decides in-process (first come wins, `HealthLedger`).

| Request   | Bounds                                         | Relay event      | Decides                             | Outcome (subscription)          |
| --------- | ---------------------------------------------- | ---------------- | ----------------------------------- | ------------------------------- |
| `pickup`  | item id ≤64 `[A-Za-z0-9_.:-]`                  | `entity.despawn` | relay / local                       | `onItems` removed, `by` = taker |
| `drop`    | item type id, count 1..999, position ±1e6      | `entity.spawn`   | relay / local                       | `onItems` added                 |
| `fire`    | slot 0..63, kind 0..15, origin, unit direction | `fire`           | none (presentation)                 | remote fire effects             |
| `hit`     | target id, damage 0..400, zone ≤16, direction  | `hit`            | relay `HealthLedger` / local ledger | `onHealth` health, death        |
| `reload`  | slot 0..63                                     | `reload`         | owner (ammo local)                  | presentation                    |
| `claim`   | entity id                                      | `entity.claim`   | relay / local                       | `onClaims` driver = claimer     |
| `release` | entity id, optional rest pose                  | `entity.release` | relay / local                       | `onClaims` driver null + pose   |
| (timer)   | respawn delay `RESPAWN_DELAY_S`                | `respawn`        | relay / `update()`                  | `onHealth` respawn              |

Open: the relay does not yet validate `reload`; it is forwarded as a generic bounded event.
