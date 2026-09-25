/**
 * One node in a scene: identity, a rigid transform, and the payloads its kind allows.
 *
 * Coordinates are metres, Y-up, −Z forward. Rotations persist as unit quaternions [x, y, z, w].
 * UI angles are degrees. A name never selects behavior; `kind` does.
 * Document limits, hierarchy checks and the transform graph stay in `stage/scene.ts`.
 */
import { boxSolid } from '../math/solid/mesh.js'
import { finite, size, transform, vector } from './coords.js'
import { portalField } from './portal/field.js'
import { lightField } from './light/field.js'
import { spriteField } from './sprite/field.js'
import { vehicleField, visualField } from './vehicle/field.js'
import { roadField } from './road/field.js'
import { terrainField } from './terrain/field.js'
import { landcoverField } from './landcover/field.js'
import { sourceField } from './source/field.js'
import type { Vec3Tuple } from '../math/frame/vectors.js'
import { z } from 'zod'

export {
  rotationDegrees,
  toDegrees,
  type QuatTuple,
  type Transform,
  type Vec3Tuple,
} from '../math/frame/vectors.js'

// --- Record ------------------------------------------------------------------
// `kind` chooses which of the optional payloads below are legal. Checks live in `stage/scene.ts`.
export const entitySchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(100),
    parentId: z.string().nullable(),
    mapBaseline: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .optional(),
    kind: z.enum(['group', 'box', 'vehicle', 'spawn', 'solid', 'terrain']),
    transform,
    groundOffset: finite.min(0).max(10000).optional(),
    geoAnchor: z
      .object({
        latitude: finite.min(-90).max(90),
        longitude: finite.min(-180).max(180),
        altitude: finite,
      })
      .strict()
      .optional(),
    size,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    motion: z.enum(['none', 'static', 'dynamic']),
    mass: finite.min(0.1).max(100000),
    light: lightField.optional(),
    railway: z
      .object({ part: z.enum(['ballast', 'rail']) })
      .strict()
      .optional(),
    placeLabel: z
      .object({ text: z.string().min(1).max(100), category: z.enum(['city', 'town', 'village']) })
      .strict()
      .optional(),
    road: roadField.optional(),
    terrain: terrainField.optional(),
    mapEditable: z.boolean().optional(),
    source: sourceField.optional(),
    geometry: z
      .object({
        vertices: z.array(vector).max(2048),
        edges: z
          .array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]))
          .max(8192),
        faces: z.array(z.array(z.number().int().nonnegative()).min(3).max(64)).max(4096),
        roofFaces: z.array(z.number().int().nonnegative()).max(4096).optional(),
      })
      .strict()
      .optional(),
    roofColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    vehicle: vehicleField.optional(),
    visual: visualField.optional(),
    portal: portalField.optional(),
    sprite: spriteField.optional(),
    surface: z
      .object({ url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.(jpg|jpeg|png)$/) })
      .strict()
      .optional(),
    landcover: landcoverField.optional(),
  })
  .strict()

export type { VehicleDefinition, VisualDefinition } from './vehicle/field.js'
export type Entity = z.infer<typeof entitySchema>

// --- Factory -----------------------------------------------------------------
// Defaults for a new node. Terrain and solids fill the payload their kind requires.
export function createEntity(
  id: string,
  kind: Entity['kind'],
  position: Vec3Tuple = [0, 0, 0],
): Entity {
  return {
    id,
    name:
      kind === 'vehicle'
        ? 'Coche'
        : kind === 'spawn'
          ? 'Inicio'
          : kind === 'group'
            ? 'Grupo'
            : 'Bloque',
    kind,
    parentId: null,
    transform: { position, rotation: [0, 0, 0, 1] },
    size: kind === 'vehicle' ? [1.8, 0.65, 4] : [2, 2, 2],
    color: kind === 'vehicle' ? '#e9a34e' : '#6c8492',
    motion: kind === 'vehicle' ? 'dynamic' : kind === 'box' ? 'static' : 'none',
    mass: kind === 'vehicle' ? 1200 : 40,
    ...(kind === 'terrain'
      ? {
          name: 'Terreno',
          motion: 'static' as const,
          terrain: { columns: 2, rows: 2, spacing: 2, heights: [0, 0, 0, 0] },
        }
      : {}),
    ...(kind === 'solid'
      ? { name: 'Edificio', motion: 'static' as const, geometry: boxSolid([2, 2, 2]) }
      : {}),
  }
}

/** Authored road solids retain OSM provenance but are not optional map buildings. */
export function isMapBuilding(entity?: Entity): boolean {
  return !!(
    entity?.source &&
    entity.geometry &&
    !entity.landcover &&
    !entity.railway &&
    !entity.source.tags.highway
  )
}
