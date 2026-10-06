import { SURFACE_LAYERS } from '../../planet/land/surface.js'
import * as THREE from 'three'

/**
 * `{ map }` when there is a texture, else `{}`: three.js warns "parameter 'map' has value of undefined"
 * for a key that is present but undefined, once per material.
 */
export function withMap(map: THREE.Texture | undefined): { map?: THREE.Texture } {
  return map ? { map } : {}
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

/**
 * Asphalt contrast: a draw-time tone curve on the roads photo drape, and on the OSM-masked
 * carriageways of the terrain photo where the asphalt is only part of the orthophoto; the tile
 * texture is untouched.
 * On luminance, in approximate display space (square root of the linear luma), around
 * `ASPHALT_CONTRAST_PIVOT`: dark asphalt gets darker and painted markings brighter. It runs on the
 * photo texel before `ROADS_DRAPE_TINT`, so the existing darkening stays. 1 leaves it unchanged
 * (the engine default); the shader skips the curve entirely at 1.
 */
export const ASPHALT_CONTRAST_DEFAULT = 1
/** Lowest asphalt contrast (softer than the photo). */
export const ASPHALT_CONTRAST_MIN = 0.5
/** Highest asphalt contrast. */
export const ASPHALT_CONTRAST_MAX = 2.5
/**
 * Display-space level that the asphalt contrast keeps fixed. Orthophoto asphalt sits around
 * 0.5–0.6 and road paint above 0.85, so 0.7 darkens the one and whitens the other.
 */
export const ASPHALT_CONTRAST_PIVOT = 0.7

/** One set of uniforms for every roads drape: changing the contrast never recompiles. */
const asphaltUniforms = {
  asphaltContrast: { value: ASPHALT_CONTRAST_DEFAULT },
  asphaltPivot: { value: ASPHALT_CONTRAST_PIVOT },
}

/** Clamp to `ASPHALT_CONTRAST_MIN`..`ASPHALT_CONTRAST_MAX`; non-finite input is a caller bug. */
export function clampAsphaltContrast(value: number): number {
  if (!Number.isFinite(value))
    throw new RangeError(`Asphalt contrast must be a finite number, got ${value}`)
  return Math.min(ASPHALT_CONTRAST_MAX, Math.max(ASPHALT_CONTRAST_MIN, value))
}

/** Current asphalt contrast, shared by every roads drape in the page. */
export function asphaltContrast(): number {
  return asphaltUniforms.asphaltContrast.value
}

/** Set the asphalt contrast live for every roads drape; returns the clamped value applied. */
export function setAsphaltContrast(value: number): number {
  asphaltUniforms.asphaltContrast.value = clampAsphaltContrast(value)
  return asphaltUniforms.asphaltContrast.value
}

/** The shader's curve on one linear luminance (0..1); for tests and tooling. */
export function asphaltContrastTone(
  linear: number,
  contrast = asphaltContrast(),
  pivot = ASPHALT_CONTRAST_PIVOT,
): number {
  if (contrast === 1) return linear
  const tone = Math.min(1, Math.max(0, (Math.sqrt(Math.max(linear, 0)) - pivot) * contrast + pivot))
  return tone * tone
}

const MAP_MULTIPLY = 'diffuseColor *= sampledDiffuseColor;'
const asphaltTone = (weight: string) => /* glsl */ `
	if ( asphaltContrast != 1.0 ) {
		float asphaltWeight = ${weight};
		if ( asphaltWeight > 0.0 ) {
			// Luminance only: the hue and saturation of the photo stay, so yellow paint stays yellow.
			vec3 asphaltColor = max( sampledDiffuseColor.rgb, vec3( 0.0 ) );
			float asphaltLuma = dot( asphaltColor, vec3( 0.2126, 0.7152, 0.0722 ) );
			float asphaltTone = clamp( ( sqrt( asphaltLuma ) - asphaltPivot ) * asphaltContrast + asphaltPivot, 0.0, 1.0 );
			asphaltColor = clamp( asphaltColor * ( asphaltTone * asphaltTone / max( asphaltLuma, 1e-4 ) ), 0.0, 1.0 );
			sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, asphaltColor, asphaltWeight );
		}
	}
`

/**
 * Add the asphalt curve to a fragment shader: it runs on the map texel right before the texel
 * multiplies the material colour. `masked` weights it by the `asphaltMask` texture (red channel,
 * same UVs as the map) instead of applying it to every pixel. Shaders without `map_fragment`
 * come back unchanged.
 */
export function asphaltContrastShader(fragmentShader: string, masked = false): string {
  const chunk = THREE.ShaderChunk.map_fragment
  if (!chunk.includes(MAP_MULTIPLY) || !fragmentShader.includes('#include <map_fragment>'))
    return fragmentShader
  const weight = masked ? 'texture2D( asphaltMask, vMapUv ).r' : '1.0'
  return (
    'uniform float asphaltContrast;\nuniform float asphaltPivot;\n' +
    (masked ? 'uniform sampler2D asphaltMask;\n' : '') +
    fragmentShader.replace(
      '#include <map_fragment>',
      chunk.replace(MAP_MULTIPLY, asphaltTone(weight) + '\t' + MAP_MULTIPLY),
    )
  )
}

/**
 * Give a photo-drape material the asphalt contrast curve. Without `mask` every pixel is asphalt
 * (the roads drape, cut to the road surfaces); with `mask` the curve follows that per-material
 * road mask (the terrain drape, see `asphalt-mask.ts`); swap `mask.value` later without a
 * recompile. Call it before shadow setup, which chains `onBeforeCompile`. The program cache key
 * keeps these apart from the other drapes, whose shadow wrappers have the same source text.
 */
export function withAsphaltContrast<T extends THREE.Material>(
  material: T,
  mask?: { value: THREE.Texture },
): T {
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    Object.assign(shader.uniforms, asphaltUniforms)
    if (mask) shader.uniforms.asphaltMask = mask
    shader.fragmentShader = asphaltContrastShader(shader.fragmentShader, !!mask)
  }
  const key = mask ? 'asphalt-mask:' : 'asphalt-contrast:'
  material.customProgramCacheKey = () => key + material.onBeforeCompile.toString()
  material.userData.asphaltContrast = asphaltUniforms
  if (mask) material.userData.asphaltMask = mask
  return material
}

export function groundDepthBias(layer: number) {
  return {
    polygonOffset: true,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer,
  }
}
