# Vehicle damage and destruction

The browser game enables physical impact damage. A session starts with 100 health
per powered vehicle. Actual bullet hits subtract kinetic energy / 40 (capped at 25
health per shot); camera, navigation and ground ray probes cause no damage.

Chassis impacts below 12 m/s along the contact normal do no damage. Stronger
contacts subtract `(speed - 12) * 7`, capped at 100, with a one-second cooldown
per vehicle/contact body. Contact speeds are captured before the solver runs.

At zero health a vehicle explodes exactly once. Within 12 metres, a blast pushes
dynamic bodies with a distance falloff and can damage other vehicles enough to
trigger a chain reaction. A motorcycle rider is ejected. Destroyed vehicles cannot
be mounted, restarted, lifted or repaired by the ordinary R upright command.

Presentation adds a brief fireball and local light, twelve seconds of flickering
fire and 45 seconds of dark smoke (full for 30 seconds, fading over the last 15), and charred body materials. Four pooled spatial audio voices
cover explosions and glass breaks. Smoke follows the existing quality toggle.
The particle pools are bounded; starting a fresh session restores health,
glass geometry and body materials.

Vehicle glass hit by an actual shot loses only the connected pane at the ray hit,
with a short burst of glass fragments and a spatial breaking sound. This stops
that round without damaging the engine. Shared source geometry is cloned before
modification. Windows are identified by the authored glass/windscreen material
names. Remaining chassis collision boxes still represent the vehicle hull; this
is a visual pane-break system, not detailed bullet penetration through cabins.

Engine hosts can use `Simulation.damageVehicle`, `vehicleDamage` and
`consumeExplosions`. Set `Simulation`'s `vehicleDamage` option to enable damage
from collisions; explicit weapon damage is available independently of that option.

## Detached parts and variation

Only complete wheel assemblies detach. Doors, hood and trunk on cars, fork and
swingarm on motorcycles, and truck doors disappear; they are restored on session
reset. Wheels launch from a jittered explosion centre with varied velocity/spin,
then use cylindrical support against the ground, rolling friction and a sleep
threshold instead of jittering indefinitely. Detached materials darken; flames
stay world-up even on overturned vehicles. The physical blast applies impulses
away from each body's centre of mass to produce varied tumble.

Smoke quantity defaults to 10%, adjustable from 0 to 300%. The live multiplier
also affects exhaust, tyre and weapon smoke. Pools and shader programs are prepared
during loading. See [central gameplay tuning](gameplay-tuning.md) for editable values
and the rear-shot trunk balloon interaction.
