# Trucks: ideas for the Ventas / Lechumborro / Irun digital twin

Status: **idea document, nothing here is implemented.** Date: 2026-10-03.
Priority order: **(1) driving a truck**, then (2) slow traffic, (3) parked trucks, (4) traffic AI.

## 0. What exists today (verified in this repo on `main` at `fe388cf`, after PR #71)

- **No open PR or branch on GitHub covers truck, trailer or articulated-vehicle physics.** The only open PR in
  `txemavs/nabla-engine` is #59 (performance preset). Searches of PRs, issues, branches and code in the Nabla
  repos for `truck`, `trailer`, `hitch` and `articulated` found nothing relevant to vehicle physics.
- **The white articulated truck (tractor unit + trailer) is not in the repository.** `assets/studio` holds only
  `cars/a3` (A3 cabrio and S3), `ships/container`, `portals` and `weapons/hk-compact`. The truck is presumably
  still an uncommitted local asset. Per `src/catalog/vehicles/README.md`, vehicles live in `assets/custom` (per
  machine, git-ignored) until published by moving the folder into `assets/studio`.
- **Wheels and steering**: `src/simulation/vehicles/wheeled/` (documented in
  [wheeled-runtime](../architecture/wheeled-runtime.md)) wraps Rapier's raycast vehicle controller. It is
  deliberately **four-wheel-specific**: `WheeledDefinition.hubs` is a 4-tuple (front hubs 0 and 1 steer; rear 2
  and 3 do not), with `drivenWheels: 'front' | 'rear' | 'all'` and an optional `powertrain`. Steering is
  `-steering * 0.45 / (1 + speed * 0.035)`, rate-limited to 1.8 per second.
- **Joints**: `src/simulation/physics.ts` has only `LockConstraint`, a Rapier **fixed** joint
  (`JointData.fixed`) with `collideConnected`, used by `Simulation` to dock a car on a carrier. There is no
  hinge, ball or trailer coupling, and no code that pairs two wheeled vehicles.
- **Colour**: `SceneView.setVehiclePaint(id, color)` calls the vehicle's presentation adapter `paint(model,
color)`. Existing adapters recolour named materials (for example `fh_paint`). One colour per entity.
- **Game entry**: `game/` (PR #71) spawns one vehicle from `?vehicle=<preset id>` using `presetVehicle` and
  `Simulation`. It has no trailer or multi-vehicle logic.

If the truck work exists as a PR or branch somewhere that is not on GitHub (for example only on a local
machine), this document must be reconciled with it before implementation.

## 1. Driving trucks (first priority)

Goal: the player boards the white articulated truck in the game, first the **tractor unit alone**, then with a
coupled **trailer**.

### 1.1 Tractor unit alone

- Publish the model as a vehicle preset: `assets/studio/trucks/<name>/<name>.json` plus GLBs (body, wheel,
  optionally steering), same schema as `assets/studio/cars/a3/a3.json` (`size`, `mass`, `vehicle.colliders`,
  `vehicle.hubs`, `visual.*`). Record provenance in `assets/README.md`.
- Reuse the wheeled runtime unchanged for a first version: model the tractor as **4 hubs** (front axle steered,
  dual rear wheels collapsed into one hub per side, driven wheels `rear`). This needs no engine change and
  gives a drivable truck quickly.
- Truck-specific tuning to expect: a mass of several tonnes for the tractor alone (measure from the model), a long wheelbase (steering angle must
  shrink more with speed than for the A3), low top speed, a truck powertrain (ratios, torque curve), strong
  brakes, a higher driver eye point and camera distance.
- Acceptance (headless, no GPU): the preset loads, the tractor accelerates, steers, brakes and stays on a flat
  floor in the same shared Rapier world, like `examples/modularity/wheeled-runtime.mjs`.

### 1.2 Coupling and towing a trailer

- **Second body**, not a child mesh: the trailer is its own dynamic body with its own colliders, in the same
  world (the contract is one world, one fixed clock).
- **Coupling joint at the fifth wheel**: a joint between the tractor's coupling point (above the rear axle) and
  the trailer's kingpin. Rapier provides revolute, spherical and generic joints; the current facade exposes
  only the fixed one, so a thin `HitchConstraint` next to `LockConstraint` is needed.
  - Start with a **spherical joint** (free yaw, pitch and roll at the pin) and let the trailer's own wheels
    keep it upright. A pure yaw hinge is stiffer and would fight terrain pitch and roll.
  - Add yaw limits (jackknife limit) only if the free ball proves unstable.
  - Couple and uncouple at runtime (add and remove the joint), snapping when the tractor backs under a parked
    trailer within a distance and angle tolerance. This also gives the parked-trailer interaction of section 3.
- **Trailer wheels**: passive (no steering, no drive, optional brake). The current runtime assumes 4 hubs,
  front pair steered. Options, to decide in the implementation PR:
  1. generalise `WheeledDefinition` to N hubs with per-hub `steered` and `driven` flags (touches existing
     telemetry and the 27 equivalence snapshots, so keep a regression test), or
  2. add a small passive-axle runtime that only creates raycast wheels and suspension.
- Tuning to expect: trailer mass of several tonnes empty, several axle groups (collapse each group into one hub), a
  rear-end clearance box for the cab, and stability at the chosen top speed (damping, centre of mass low).
- **Recolour with the white model**: the truck is white, so the paint hook can recolour it per entity. The
  tractor and trailer are separate entities, so each takes its own colour with `setVehiclePaint` (trailer one
  colour, cab and rear another). This needs named paint materials in the GLBs and a small truck presentation
  adapter; one colour per entity is the existing contract. For the cab and the rear in two different colours,
  split them into two named materials and let the adapter take a list of colours.
- Tests (no GPU, in `test/`): coupling forms and releases; tow straight line stays aligned; a turn keeps the
  trailer within a tolerated yaw lag; braking does not jackknife at the test speed; plain A3 behaviour
  unchanged (the existing wheeled snapshots still match).

## 2. Slow traffic (decoration the player must overtake)

- A `trucks on a road at low speed` actor: follows a polyline lane taken from the road network, at a fixed
  speed (set by road class), no avoidance, no decisions.
- First version needs **no physics**: a kinematic body moved along the path by the fixed step, still with a
  collider so the player collides with it and has to overtake. Switch to the real wheeled runtime later if
  wanted.
- The road source is the lane geometry of the drivable-road work (see nabla-ways `docs/DRIVABLE_ROADS.md`
  and `docs/ROAD_VECTOR_LAYER.md`), which is not implemented yet. Until then, hand-placed polylines.
- Spawn only near the player (a streaming radius), and despawn behind, so cost does not grow with the map.

## 3. Parked trucks database (decorate truck parkings)

Problem: the clean road photos (nabla-ways pipeline) remove vehicles and their shadows. The white truck leaves
a **footprint** where it stood. In the original orthophoto from above, a truck roof looks like a hut or shed,
so imagery alone cannot classify it (see the nabla-ways `README.md`: parked semi-trailers are known to be
missed by detection, and the Irun truck park is full in every year).

Proposal: place trucks by **data, not imagery**.

1. Candidate parkings from OSM: `amenity=parking` with HGV tags (`hgv=yes`, `hgv=designated`, `capacity:hgv`),
   plus the lots already identified by hand (the Irun truck park and the Lechumborro lot) as manual entries.
2. Use the white truck footprints left in the road photos (the vehicle mask from phase 1 of the pipeline,
   plus the manual review list) as **evidence for position and heading** inside those candidates.
3. Combine: inside each known truck parking, place **a couple of trucks, nothing more** (for example 2 per
   parking, a hard cap per lot), at footprints when available, otherwise in the lot along its longest axis.
4. Nothing is placed outside a known truck parking.

### Data format (anchors, not models)

Consistent with principle P1 of `Z15_PACKAGE.md` in nabla-atlas: instanceable objects are **anchors**, never
baked meshes. Reuse the `nabla-z15-instances/1` file (`instances-<hex16>.json`), whose type vocabulary already
lists `vehicle`. Proposed anchor:

```json
{
  "schema": "nabla-z15-instances/1",
  "cell": "WebMercatorQuad/15/16224/11998",
  "types": { "vehicle": { "description": "parked or moving vehicle; class in vehicleClass" } },
  "instances": [
    {
      "id": "manual:truck-park-irun-001:0",
      "type": "vehicle",
      "vehicleClass": "truck_articulated",
      "local": [120.4, null, -35.2],
      "epsg3857": [-199000.0, 5359000.0],
      "yawDeg": 87.5,
      "model": "truck.white.articulated",
      "parts": ["tractor", "trailer"],
      "colors": { "tractor": "#c0392b", "trailer": "#f2f2f2" },
      "parkingId": "osm:way/123456789",
      "source": "manual",
      "confidence": 0.9
    }
  ]
}
```

- `local`, `epsg3857`, `yawDeg`, `source`, `confidence` follow the existing field rules (`y` null = snap to
  terrain at load; `yawDeg` clockwise from north). `vehicleClass`, `model`, `parts`, `colors` and `parkingId`
  are extra keys, which the spec allows and readers ignore.
- One anchor per combination (tractor and trailer share the pose; the engine expands `parts`).
- The engine owns the models (P2 rule 4: shared assets belong to the engine install); the package names the
  type and class only. `id` uses `manual:` for hand placement and `det:<model>:<n>` for detections.
- Keep a single source list for review (parking id, polygon, cap, anchors) and generate the per-cell
  `instances-*.json` from it.

## 4. AI for trucks and cars generating traffic (explore later, not now)

Options to compare when this becomes a priority:

1. **Path followers on lane graphs**: constant or speed-limit-based speed, car-following (IDM) behind the
   vehicle ahead, no lane changes. Cheap and deterministic.
2. **Rule-based microsimulation** (IDM plus MOBIL lane changes, priority and junction rules): realistic flow,
   needs a clean junction graph.
3. **Statistical density spawner**: spawn and despawn by road class, time of day and distance from the
   player; vehicles are decoration within a radius.
4. **Recorded or replayed trajectories**: real or authored traffic traces per road, replayed in a loop.
5. **Learned policies** (imitation or RL on a simulator such as SUMO or Nabla's own world): highest effort,
   only for specific behaviours.
6. **Hybrid**: option 3 for background, option 1 or 2 near the player, option 5 only if needed.

Decision criteria: CPU budget per vehicle, need for the drivable road graph, determinism for tests, and
whether vehicles use the real wheeled physics or a kinematic proxy.

## Next steps

1. Locate the truck asset and any existing truck physics branch (outside GitHub if needed) and reconcile with
   section 0.
2. Publish the white truck preset under `assets/studio` and drive the tractor alone (section 1.1).
3. Add the hitch constraint and passive trailer axles (section 1.2).
4. Only then slow traffic, parked trucks and AI.
