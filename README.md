# @nabla/engine

Reusable 3D mini-engine for Nabla apps, extracted from Agency stage.

> **This is a PORT, not a rewrite.** All code in this package was directly
> ported from the Agency codebase (`txemavs/agency-ui` main branch) with
> minimal changes to remove Vue/Agency-specific dependencies.

---

## Drive Demo

The `playground/` directory contains a working demonstration of the vehicle
physics system with GLB meshes and SceneNode hierarchy:

- **A3 Cabrio** — GLB body + 4 wheel child nodes, Cannon RaycastVehicle physics
- **Ship 5×10** — GLB hull with garage ramp (StaticBoxes for car to climb)

### GLB Assets

Located in `playground/public/world/`:

| File | Size | Description |
|------|------|-------------|
| `car.audi.a3.cabrio.glb` | 3.2 MB | A3 chassis body |
| `car.audi.a3.wheel.glb` | 924 KB | A3 wheel (hub at origin) |
| `car.audi.a3.steering.glb` | 103 KB | Steering wheel |
| `ship.container.5x10.glb` | 87 KB | Container ship hull |

### SceneNode Hierarchy

```
world (root)
├── a3-root          ← physics pose from VehicleWorld
│   ├── a3-body      ← GLB chassis
│   ├── a3-wheel-fl  ← GLB wheel, local pose from suspension
│   ├── a3-wheel-fr
│   ├── a3-wheel-rl
│   └── a3-wheel-rr
├── ship-root        ← physics pose
│   └── ship-body    ← GLB hull
└── avatar           ← visible in chase view
```

Each frame:
1. Physics step updates `VehicleWorld`
2. Root nodes get world pose from physics
3. Wheel nodes get local pose from suspension snapshot
4. `sceneDebugLines()` generates RGB axes + cyan parent-child lines

### Debug Gizmos

Press `G` to toggle debug visualization:
- **RGB axes** at each SceneNode origin (R=+X, G=+Y, B=-Z)
- **Cyan lines** connecting parent→child nodes

### Running the Demo

```bash
npm install
npm run playground
```

Then open http://localhost:3000 in your browser.

> **Note:** The playground uses a Vite alias to resolve `@nabla/engine` directly
> from `src/`, so no separate build or pack step is needed. Just run the command
> above and it works.

### Controls

**On Foot:**

| Key | Action |
|-----|--------|
| `W` `A` `S` `D` | Walk |
| `Shift` | Sprint |
| `F` | Rocket/Jetpack (hold) |
| `Space` | Jump |
| `E` | Enter nearest vehicle |
| `C` | Cycle view (first ↔ chase) |
| `G` | Toggle debug gizmos |
| Mouse | Look around (click to lock) |

**Driving:**

| Key | Action |
|-----|--------|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / Reverse |
| `A` / `←` | Steer left |
| `D` / `→` | Steer right |
| `Space` | Handbrake (drift) |
| `E` | Exit vehicle |
| `C` | Cycle camera (chase → pilot → far → top) |
| `G` | Toggle debug gizmos |
| `R` | Recover (flip upright) |
| Mouse | Look around |

### Coordinate System

The engine uses a **single, industry-standard coordinate system** everywhere:

```
      +Y (up)
       |
       |
       +---- +X (right)
      /
     /
   -Z (forward)
```

**Right-handed, Y-up, metres (glTF/Blender standard):**

| Axis | Direction | Note |
|------|-----------|------|
| +X | Right | |
| +Y | Up | |
| -Z | Forward | Camera looks -Z at yaw=0 |

**Camera angles (degrees):**

| Angle | Axis | Positive direction |
|-------|------|-------------------|
| yaw (ry) | Y | Turn left (CCW from above) |
| pitch (rx) | X | Look up |

**FPS mouse (standard):**

| Mouse | Effect |
|-------|--------|
| Right | View turns right (yaw decreases) |
| Up | View looks up (pitch increases) |

**WASD:**

| Key | Effect |
|-----|--------|
| W | Move in camera forward direction (-Z at yaw=0) |

### Physics

Full Cannon-es RaycastVehicle with internal coordinate transform:

- Cannon uses `indexRightAxis=0`, `indexUpAxis=1`, `indexForwardAxis=2`
- Engine applies sign corrections at the boundary
- Steering: D key → turn right (yaw decreases)
- Wheel order: FL[0], FR[1], RL[2], RR[3]

### What's Next (Out of Scope This PR)

- Portals/tunnels between worlds
- Driving the boxcar into the ship's garage
- Full GLB meshes for production visuals

---

## Installation

```bash
npm install @nabla/engine
```

## What's Included

### GL Math (`gl/glMath.ts`)
Matrix and vector math primitives for WebGL:
- `Vec2`, `Vec3` types
- `cssToGl` — CSS coordinates to GL (flip Y)
- `lookAt`, `perspective`, `frustum` — camera/projection matrices
- `mul4`, `invert4`, `transformPoint` — matrix operations
- `rayQuadHit`, `hitTri` — ray-triangle intersection

### GLB Parser (`gl/glbMesh.ts`)
GLB 2.0 parser for walk/edit bodies. No Three.js:
- `parseGlb` — ArrayBuffer → primitives (pos/color/normal/index/uv)
- `decodeGlbAlbedo` — PNG/JPEG in GLB → ImageBitmap
- `primPaint`, `primGlow` — body paint and lamp state
- `metersYupModel` — entity pose → model matrix
- `poseNormalMat` — 3×3 for lighting

### GL Camera (`gl/glCamera.ts`)
Orbit camera and ray-casting:
- `orbitEye`, `orbitEyeAt` — compute eye position
- `orbitRay` — unproject screen point to world ray
- `clampStageOrbit`, `dollyOrbit`, `orbitLookDelta`

### World Units (`world.ts`)
Unit conversions and entity pose:
- `MM_PER_M`, `PX_PER_MM` — 1 CSS px = 1 mm
- `entityYawDeg` — rad/deg detection
- `altitudeY`, `metresToCssMm`
- `EntityPose`, `entityTransform`

### Pose & Camera (`pose.ts`)
3D camera and walk controls:
- `Pose`, `StageOrbit`, `StageCamera`, `StageScreens`
- `stageViewTransform`, `stageScreenTransform`
- `stageWalkDelta`, `stageLookDelta`, `approachVel2`
- Walk/look constants (speeds, sensitivities, limits)

### Tune (`tune.ts`)
World feel knobs:
- `AgencyTune` — full config structure
- `TUNE_DEFAULTS` — shipped defaults
- `mergeTune`, `tune()`, `resetTuneCache()`

### Kind Capability (`kind/kindCapability.ts`)
Entity capability contracts:
- `CAPABILITY_DRIVE`, `CAPABILITY_FLY`, `CAPABILITY_SIT`, etc.
- `KindContract`, `hasCapability`, `kindPadWindow`
- `isHullClass`, `kindMatchingMesh`

### Entity AABB (`kind/entityAabb.ts`)
Axis-aligned bounding boxes:
- `Aabb3`, `EntityFace` types
- `aabbFaceCorners`, `aabbFaceCenter`, `aabbFaceInYaw`
- `rayHitsAabb`, `rayHitsPosedAabb`
- `aabbWireLines`, `poseOriginLines`

### Kind Props (`kind/kindProps.ts`)
Container/hull properties:
- `BoxSize`, `BoxSkin`, `BoxFace`, `KindProps`
- `innerBoxSize`, `innerBoxAabb`, `layoutBoxFaces`
- `mergeKindProps`, `parseImageRef`, `imageRefToWire`

### Vehicle Definition (`vehicle/vehicleDef.ts`)
Physics-ready vehicle contracts:
- `VehicleDefinition`, `VehicleTune`, `VehicleInput`
- `VehicleSnapshot`, `VehicleDebugFrame`
- `specToDefinition`, `specToTune`, `chassisInertia`
- `A3_DEFINITION`, `A3_TUNE` — Audi A3 Cabrio defaults

### Vehicle Debug (`vehicle/vehicleDebug.ts`)
Debug visualization:
- `DebugLine` type
- `cross`, `debugLinesFromFrame`

### Car Pack (`vehicle/carPack.ts`)
Car pack interface for body-specific data:
- `CarPack`, `CarPackMounts`, `CarPackHubs`
- `matchesCarPack`

### Obstacle Kit (`vehicle/obstacleKit.ts`)
Static obstacles for physics world:
- `StaticBox`, `StaticObstacle`, `DrivePose`
- `demoObstacles`, `obstacleDebugLines`, `obstacleQuads`
- `parkedCarCollider`

---

## Dual-World Rendering + Portals (Phase 2)

The engine implements a **three-part model** for spatial rendering:

### 1. Place (Dual Render)

A **Place** is an entity that can be rendered in two modes:

| Mode | Render Type | Description |
|------|-------------|-------------|
| `gl-hull` | WebGL 3D | Exterior world — walk or fly through meshes |
| `css-office` | CSS 3D | Interior room box — sit or walk inside |

The home ship, containers, and similar "enterable" places support both modes.

```typescript
import { interiorForHost, type InteriorRender } from '@nabla/engine'

const render: InteriorRender = interiorForHost('world.home')
// → 'css-office' (home has a CSS interior)

const render2 = interiorForHost('world.car.a3')
// → 'gl-hull' (cars are GL-only)
```

### 2. Portal (Transition)

A **Portal** is a hole on an AABB face that connects the two render modes:

- Walk through a portal **out** of CSS → appear in the normal GL 3D world
- Walk through a portal **in** → enter the CSS office interior

```typescript
import { portalCrossing, type EntityPortal, type PortalPose } from '@nabla/engine'

const portal: EntityPortal = {
  face: '-z',
  pairId: 'world.yard.avatars',
  arrive: 'walk',
  toward: 'out',
}

const crossed = portalCrossing(
  { x: prevCam.x, z: prevCam.z },
  { x: cam.x, z: cam.z },
  portalPose,
)
```

### 3. Crossing (Mode Flip)

When you **cross** a portal:

1. `InteriorRender` flips between `css-office` and `gl-hull`
2. `StageMode` updates to match
3. Camera/avatar lands at the arrival point

### New Modules (Phase 2)

#### Room Skin (`skin/roomSkin.ts`)
Golden ratio (φ) layout for room textures:
- `PHI`, `SKIN_H`, `SKIN_W`, `SKIN_D`
- `roomSkinRects`, `roomSkinSize`, `roomSkinFaceCss`

#### Room Paint (`office/roomPaint.ts`)
Authored room scenery:
- `RoomPaint`, `OfficeWorld`, `HELM_PAINT`
- `parseRoomPaint`, `deriveOffice`, `clonePaint`

#### Office Transforms (`office/officeTransforms.ts`)
CSS 3D transforms for the room box:
- `officeFloorTransform`, `officeSkyTransform`, etc.
- `helmInside`, `clampRoomWalk`, `roomHalfPx`

#### Helm Screen (`office/helmScreen.ts`)
Monitor layout:
- `HelmScreen` type (`'left' | 'center' | 'right'`)
- `adjacentHelmScreen`, `hopHelmScreen`

#### Interior (`interior/interior.ts`)
Dual-render model:
- `InteriorRender` type (`'css-office' | 'gl-hull'`)
- `interiorForHost`, `interiorContainsCamera`

#### Portal Graph (`portal/portalGraph.ts`)
Portal definition and crossing:
- `EntityPortal`, `LivePortal`, `PortalHost`
- `portalCrossing`, `portalPoseOnFace`, `mapThroughPortals`
- `approachCamera`, `enterNaveCamera`, `insideCamera`

#### HomeCarrier (`portal/homeCarrier.ts`)
Room ↔ lot transforms:
- `HomeCarrier`, `IDENTITY_CARRIER`
- `rideHomeCarrier`, `inverseRideHomeCarrier`
- `rideCamera`, `rideMeshPose`

#### Wormhole (`portal/wormhole.ts`)
Free-standing stargate:
- `WormholeMouth`, `WormholeHost`
- `wormholeCrossing`, `wormholeTransit`, `wormholeArrive`

#### Portal Projection (`portal/portalProj.ts`)
CAVE-style frustum for looking through portals:
- `portalEyeCss`, `portWindowCss`
- `portalViewProj`, `portalViewProjParts`

---

## Ported Files

The following files from Agency (`txemavs/agency-ui` main) were ported:

| Agency Path | Engine Path | Status |
|-------------|-------------|--------|
| `stage/gl/glMath.ts` | `src/gl/glMath.ts` | ✅ Full port |
| `stage/gl/glbMesh.ts` | `src/gl/glbMesh.ts` | ✅ Full port |
| `stage/gl/glCamera.ts` | `src/gl/glCamera.ts` | ⚠️ Partial (orbit only) |
| `stage/kind/entityAabb.ts` | `src/kind/entityAabb.ts` | ✅ Full port |
| `stage/kind/kindCapability.ts` | `src/kind/kindCapability.ts` | ✅ Full port |
| `stage/kind/kindProps.ts` | `src/kind/kindProps.ts` | ✅ Full port (sans CSS) |
| `stage/vehicle/vehicleDef.ts` | `src/vehicle/vehicleDef.ts` | ✅ Full port |
| `stage/vehicle/carPack.ts` | `src/vehicle/carPack.ts` | ✅ Full port |
| `stage/vehicle/obstacleKit.ts` | `src/vehicle/obstacleKit.ts` | ✅ Full port |
| `stage/vehicle/vehicleDebug.ts` | `src/vehicle/vehicleDebug.ts` | ⚠️ Partial |
| `stage/world.ts` | `src/world.ts` | ✅ Full port |
| `stage/tune.ts` | `src/tune.ts` | ✅ Full port |
| `schema/pose.ts` | `src/pose.ts` | ⚠️ Partial (3D only) |

### Omitted / Left Out

The following were **not** ported because they depend on Agency-specific modules
or are out of scope:

| File | Reason |
|------|--------|
| `stage/kind/entityPick.ts` | Depends on `RoomEntity`, `fpsEyeGl`, `fpsForwardCss` |
| `stage/gl/glCamera.ts` (FPS) | Depends on `spaceFlight`, `walkBody`, `roomPaint` |
| `schema/pose.ts` (2D chrome) | Desktop/Vue-specific (carousel, shelf, window chrome) |
| `stage/vehicle/vehicleSpec.ts` | Not attached — stubbed with defaults from `vehicleDef.ts` |
| `stage/vehicle/drive.ts` | Not attached — omitted |
| `stage/vehicle/vehiclePresent.ts` | Not attached — omitted |
| A3 / Ship5x10 packs | Intentionally excluded per requirements |

### Stubbed Types

The following types were stubbed minimally to satisfy imports:

- `StageMeshRef`, `StageImageRef` — in `src/kind/types.ts`
- `VehicleSpec`, `parseVehicleSpec` — in `src/vehicle/vehicleSpec.ts`

---

## Usage

```typescript
import {
  parseGlb,
  metersYupModel,
  lookAt,
  perspective,
  mul4,
  specToDefinition,
  A3_TUNE,
  TUNE_DEFAULTS,
} from '@nabla/engine'

// Parse a GLB file
const prims = parseGlb(arrayBuffer)

// Build view/projection matrices
const view = lookAt([0, 2, 5], [0, 0, 0], [0, 1, 0])
const proj = perspective(60, 16/9, 0.1, 1000)
const vp = mul4(proj, view)

// Create vehicle definition
const def = specToDefinition({ mass: 1500, wheelbase: 2.7 })
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

---

## Intentional Differences from Agency

The engine preserves Agency's **physics math** (axes, signs, forces) but redesigns
some wrappers for a cleaner API. Agency can adapt to these when consuming the engine.

| Area | Agency | Engine | Rationale |
|------|--------|--------|-----------|
| `VehicleSim` class | Imports from `@/stage/vehicle/*` with Vue paths | Clean ES module, no path aliases | Standalone module |
| `VehicleSpec` | Optional fields with runtime defaults | All fields required after `parseVehicleSpec()` | Type safety, explicit contracts |
| `DriveInput` | Spread across `drive.ts` and composables | Single `DriveInput` interface | Simpler integration |
| `DriveState` | Tied to `RoomEntity` | Pure data object | Decoupled from scene graph |
| Pack structure | `stage/vehicle/a3cabrio/`, etc. | `src/packs/boxcar/`, `src/packs/ship5x10/` | Cleaner namespace for publishable packs |
| Camera helpers | Mixed with Vue reactivity | Pure functions returning `DriveCamera` | Framework-agnostic |

### Preserved (Do Not Change)

These are the physics truth from Agency and must remain identical:

- `RaycastVehicle` axis indices: `indexRightAxis=0`, `indexUpAxis=1`, `indexForwardAxis=2`
- Engine force sign: negative force → forward motion
- Steering sign: negative steer → right turn
- Wheel order: FL[0], FR[1], RL[2], RR[3]
- `specToDefinition()` / `specToTune()` formulas
- Anti-roll bar and arcade damping math
- Collision groups and masks

---

## License

MIT
