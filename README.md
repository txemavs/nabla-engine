# @nabla/engine

Reusable 3D mini-engine for Nabla apps, extracted from Agency stage.

> **This is a PORT, not a rewrite.** All code in this package was directly
> ported from the Agency codebase (`txemavs/agency-ui` main branch) with
> minimal changes to remove Vue/Agency-specific dependencies.

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

## License

MIT
