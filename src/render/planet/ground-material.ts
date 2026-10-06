import { SURFACE_LAYERS } from '../../planet/land/surface.js'
import * as THREE from 'three'

/**
 * `{ map }` when there is a texture, else `{}`: three.js warns "parameter 'map' has value of undefined"
 * for a key that is present but undefined, once per material.
 */
export function withMap(map: THREE.Texture | undefined): { map?: THREE.Texture } {
  return map ? { map } : {}
}

/**
 * Terrain casts its shadow from the faces turned away from the sun only. A heightfield's sunlit
 * faces then never write into the shadow map, so they cannot shadow themselves (acne: contour
 * stripes on every gentle slope under a low sun), while hills still shade the valleys behind them.
 * Three.js already does this for single-sided materials; it is set explicitly so double-sided
 * ground (the Atlas LiDAR mesh is exported `doubleSided`; see `tileMeshSide`) never writes its lit
 * side, whatever side it renders with. Returns the material.
 */
export function castShadowFromBackFaces<T extends THREE.Material>(material: T): T {
  material.shadowSide = THREE.BackSide
  return material
}

/** Tile categories that are bare ground: only ever seen from above, never bridges or walls. */
const GROUND_CATEGORIES = new Set(['Terrain', 'Surfaces'])

/**
 * Whether a streamed tile mesh is bare ground (terrain, land-use surfaces or a ground-photo drape).
 * Roads are not: their meshes carry the bridge decks, which must stay visible from below. Skirts,
 * buildings and water keep their own sides too.
 */
export function isGroundSurface(metadata: {
  category?: unknown
  drape?: unknown
  skirt?: unknown
}): boolean {
  if (metadata.skirt) return false
  if (typeof metadata.drape === 'string') return metadata.drape !== 'roads'
  return typeof metadata.category === 'string' && GROUND_CATEGORIES.has(metadata.category)
}

/**
 * Share of triangles wound counter-clockwise seen from +Y (front face up), from at most `sample`
 * evenly spaced triangles. 1 for a heightfield exported the right way up.
 */
export function upwardWinding(
  position: ArrayLike<number>,
  index?: ArrayLike<number>,
  sample = 4096,
): number {
  const count = Math.floor((index ? index.length : position.length / 3) / 3)
  if (!count) return 0
  const step = Math.max(1, Math.floor(count / sample))
  let up = 0,
    seen = 0
  for (let t = 0; t < count; t += step) {
    const a = index ? index[t * 3] : t * 3,
      b = index ? index[t * 3 + 1] : t * 3 + 1,
      c = index ? index[t * 3 + 2] : t * 3 + 2
    const ax = position[a * 3],
      az = position[a * 3 + 2]
    const ux = position[b * 3] - ax,
      uz = position[b * 3 + 2] - az
    const vx = position[c * 3] - ax,
      vz = position[c * 3 + 2] - az
    // y of (b - a) x (c - a)
    const y = uz * vx - ux * vz
    if (y > 0) up++
    if (y !== 0) seen++
  }
  return seen ? up / seen : 0
}

/**
 * Render side for a streamed tile mesh. Ground is drawn single-sided (`FrontSide`) even when the
 * GLB says `doubleSided` (the Atlas LiDAR terrain does): nobody looks at the ground from below,
 * and the hidden sides of hills stop costing fragments. Only ground whose triangles face up is
 * changed; anything else (roads with bridges, buildings, water, skirts, ground wound the wrong
 * way) keeps the GLB side, so a bad export never turns into holes.
 */
export function tileMeshSide(
  side: THREE.Side,
  metadata: { category?: unknown; drape?: unknown; skirt?: unknown },
  position: ArrayLike<number>,
  index?: ArrayLike<number>,
): THREE.Side {
  if (side !== THREE.DoubleSide || !isGroundSurface(metadata)) return side
  return upwardWinding(position, index) > 0.5 ? THREE.FrontSide : side
}

/** Diffuse ground: roughness alone still leaves a broad dielectric sun highlight. */
export function matteGroundMaterial(
  parameters: THREE.MeshStandardMaterialParameters,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    ...parameters,
    roughness: 1,
    metalness: 0,
    specularIntensity: 0,
    envMapIntensity: 0,
  })
}

const firstTransportLayer = Math.max(...Object.values(SURFACE_LAYERS)) + 1
const footHighways = ['path', 'footway', 'pedestrian', 'cycleway', 'steps', 'track']

/** Carriageways paint white on the GPS. Paths, tracks and rails stay blue. */
export function isChartCarriageway(metadata: {
  groundLayer?: number
  transport?: string
  source?: { tags?: Record<string, string> }
}): boolean {
  if (metadata.transport === 'rail' || metadata.transport === 'ballast') return false
  const highway = metadata.source?.tags?.highway
  if (highway && footHighways.includes(highway)) return false
  if (metadata.groundLayer === firstTransportLayer) return false
  return true
}

/** Feet stay under the carriageway and the rails. 17 is the layer that briefly drew them on top. */
export function liftFootLayer(layer: number): number {
  return layer === firstTransportLayer || layer === firstTransportLayer + 5
    ? firstTransportLayer
    : layer
}

export function footBuried(layer: number): boolean {
  return layer === firstTransportLayer
}

/** Order only coplanar transport surfaces; physical bridge/tunnel heights still apply. */
export function transportLayer(entity: {
  railway?: { part: string }
  source?: { tags?: Record<string, string> }
}): number {
  if (entity.railway) return firstTransportLayer + (entity.railway.part === 'ballast' ? 2 : 3)
  const highway = entity.source?.tags?.highway
  return firstTransportLayer + (highway && footHighways.includes(highway) ? 0 : 1)
}

const carriagewayLayer = firstTransportLayer + 1

/** Delete after the next GLB regen. Bake carriageway `#272c2e` (`#525c60` × 0.48) into COLOR_0. */
export function carriagewayTint(
  metadata: { category?: string; groundLayer?: number; transport?: string },
  tint: string,
): string {
  if (
    metadata.category !== 'Roads' ||
    metadata.transport === 'rail' ||
    metadata.transport === 'ballast' ||
    metadata.groundLayer !== carriagewayLayer
  )
    return tint
  return '#' + new THREE.Color(tint).multiplyScalar(0.48).getHexString()
}

/** Multiply on the roads photo drape (vehicle-paint style). */
export const ROADS_DRAPE_TINT = '#c2c2c2'

export function groundDepthBias(layer: number) {
  return {
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer,
  }
}
