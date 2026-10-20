import type * as THREE from 'three'
import type { NodeKit } from '../webgpu-substitutes.js'
import { noiseNodes } from './noise-nodes.js'

/**
 * TSL equivalents of the `onBeforeCompile` patches on built-in surface materials (ground cloud
 * shadow, asphalt contrast, river and sea waves, tree crowns), drawn by the WebGPU backend only.
 * Each follows its GLSL source in the named file.
 */

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Live = { value: number }
type NodeTwin = THREE.Material & Record<string, N>

/** A float uniform that reads `source.value` every render (the GLSL uniform objects stay owners). */
const liveFloat = (tsl: N, source: Live) =>
  tsl.uniform(source.value).onRenderUpdate(() => source.value)

/**
 * `patchGroundCloudShadow` (artistic-clouds.ts) as a factor on the sun's light: the cumulus
 * shade above the fragment, 1 for clear sky. WebGL multiplies the summed direct diffuse by it;
 * here it multiplies the shadowed sun colour, so it also dims that light's (small) specular.
 */
export function groundCloudShade(
  tsl: NodeKit['tsl'],
  shadow: {
    sun: { value: THREE.Vector3 }
    origin: { value: THREE.Vector3 }
    dayHours: Live
    day: Live
    amount: Live
    storm: Live
    cumBase: Live
    coverage: Live
  },
): N {
  const t = tsl as N
  const { uniform, normalize, positionWorld, vec2, min, max, clamp, mix, smoothstep, Fn } = t
  const { cumulus } = noiseNodes(tsl)
  const sunU = uniform(shadow.sun.value)
  const origin = uniform(shadow.origin.value)
  const hours = liveFloat(t, shadow.dayHours)
  const day = liveFloat(t, shadow.day)
  const amount = liveFloat(t, shadow.amount)
  const storm = liveFloat(t, shadow.storm)
  const base = liveFloat(t, shadow.cumBase)
  const cover = liveFloat(t, shadow.coverage)
  return Fn(() => {
    const sun = normalize(sunU)
    const shift = vec2(sun.x, sun.z)
      .negate()
      .mul(min(base.div(max(sun.y, 0.22)), 8000))
    const thresh = clamp(mix(0.94, 0.15, amount).sub(storm.mul(0.08)), 0.05, 0.97)
    const puff = cumulus(
      vec2(positionWorld.x, positionWorld.z).add(vec2(origin.x, origin.z)).add(shift),
      hours,
      thresh,
    )
    const shade = clamp(puff.mul(mix(0.12, 1.35, amount)), 0, 1)
      .mul(cover)
      .mul(day)
      .mul(smoothstep(0.02, 0.2, sun.y))
    return mix(1, 0.46, shade)
  })()
}

/**
 * `asphaltContrastShader` (ground-material.ts): the luminance curve on the map texel before it
 * multiplies the material colour, weighted by the red channel of `mask` when given.
 */
export function asphaltContrastNodes(
  twin: NodeTwin,
  { tsl }: NodeKit,
  uniforms: { asphaltContrast: Live; asphaltPivot: Live },
  mask?: { value: THREE.Texture },
): void {
  const t = tsl as N
  const { texture, uniform, uv, vec3, vec4, dot, sqrt, clamp, max, mix, select, Fn } = t
  if (!twin.map) return
  const contrast = liveFloat(t, uniforms.asphaltContrast)
  const pivot = liveFloat(t, uniforms.asphaltPivot)
  const map = texture(twin.map, uv()).onRenderUpdate(() => twin.map)
  const weight = mask ? texture(mask.value, uv()).onRenderUpdate(() => mask.value).r : 1
  const color = uniform(twin.color)
  twin.colorNode = Fn(() => {
    const sampled = map.toVar()
    const asphaltColor = max(sampled.rgb, vec3(0))
    const luma = dot(asphaltColor, vec3(0.2126, 0.7152, 0.0722))
    const tone = clamp(sqrt(luma).sub(pivot).mul(contrast).add(pivot), 0, 1)
    const toned = clamp(asphaltColor.mul(tone.mul(tone).div(max(luma, 1e-4))), 0, 1)
    const curved = mix(sampled.rgb, toned, weight)
    const active = contrast.notEqual(1).and(t.float(weight).greaterThan(0))
    return vec4(color.mul(select(active, curved, sampled.rgb)), sampled.a)
  })()
}

/** The three drifting normal samples of `waterWaves` / `SeaWater.shade` (tangent `waves`, y up). */
function waveNormal(t: N, tex: THREE.Texture, xz: N, time: N): N {
  const { texture, normalize, mix, vec3 } = t
  const waveUV = xz.div(256)
  const waveTime = time.div(256)
  const sample = (uv: N) => texture(tex, uv).xyz
  const waves = sample(waveUV.add(waveTime).mul(3))
    .mul(0.25)
    .add(sample(waveUV.add(waveTime).mul(16)).mul(0.25))
    .add(sample(waveUV.sub(waveTime).mul(8)).mul(0.5))
    .mul(2)
    .sub(1)
  const n = normalize(mix(waves, vec3(0, 0, 1), 0.9))
  return vec3(n.x, n.z, n.y)
}

/** `waterWaves` (water-material.ts): river and ocean-sheet normals. */
export function riverWaveNodes(
  twin: NodeTwin,
  { tsl }: NodeKit,
  tex: THREE.Texture,
  time: Live,
  offset?: { value: THREE.Vector3 },
): void {
  const t = tsl as N
  const {
    varying,
    positionGeometry,
    modelWorldMatrix,
    vec2,
    vec4,
    uniform,
    normalize,
    cameraViewMatrix,
  } = t
  const timeU = liveFloat(t, time)
  let xz: N
  if (offset) {
    const origin = uniform(offset.value)
    const world = modelWorldMatrix.mul(vec4(positionGeometry, 1))
    xz = varying(vec2(world.x, world.z).add(vec2(origin.x, origin.z)))
  } else xz = varying(vec2(positionGeometry.x, positionGeometry.z))
  const waves = waveNormal(t, tex, xz, timeU)
  twin.normalNode = offset
    ? normalize(t.normalViewGeometry.add(cameraViewMatrix.mul(vec4(waves.x, 0, waves.z, 0)).xyz))
    : normalize(cameraViewMatrix.mul(vec4(waves, 0)).xyz)
}

/**
 * `SeaWater.shade` (water.ts): wave normals, then the flat colour times the sun strength, dimmed
 * by the direct-light shadow, plus one solar glint. The lighting model keeps only the ratio of
 * shadowed to unshadowed direct diffuse, as the GLSL does with `reflectedLight.directDiffuse`.
 */
export function seaNodes(
  twin: NodeTwin,
  { tsl, webgpu }: NodeKit,
  tex: THREE.Texture,
  time: Live,
  sunDirection: { value: THREE.Vector3 },
  sunStrength: Live,
): void {
  const t = tsl as N
  const {
    varying,
    positionGeometry,
    vec2,
    vec4,
    float,
    uniform,
    normalize,
    cameraViewMatrix,
    reflect,
  } = t
  const { positionView, normalView, max, pow, dot, mix, clamp, diffuseColor, vec3 } = t
  const timeU = liveFloat(t, time)
  const strength = liveFloat(t, sunStrength)
  const sunU = uniform(sunDirection.value)
  const xz = varying(vec2(positionGeometry.x, positionGeometry.z))
  twin.normalNode = normalize(cameraViewMatrix.mul(vec4(waveNormal(t, tex, xz, timeU), 0)).xyz)
  const Base = (webgpu as N).LightingModel
  class SeaLighting extends Base {
    shadowed: N
    unshadowed: N
    start(builder: N) {
      this.shadowed = float(0).toVar('seaShadowed')
      this.unshadowed = float(0).toVar('seaUnshadowed')
      super.start(builder)
    }
    direct({ lightDirection, lightColor, lightNode }: N) {
      const dotNL = clamp(dot(normalView, lightDirection), 0, 1)
      const base = lightNode.baseColorNode ?? lightColor
      this.shadowed.addAssign(dot(lightColor, base).mul(dotNL))
      this.unshadowed.addAssign(dot(base, base).mul(dotNL))
    }
    finish(builder: N) {
      const shadow = this.unshadowed
        .greaterThan(1e-6)
        .select(clamp(this.shadowed.div(this.unshadowed), 0, 1), 1)
      const reflectedEye = reflect(normalize(positionView), normalView)
      const solarView = normalize(cameraViewMatrix.mul(vec4(sunU, 0)).xyz)
      const alignment = max(0, dot(reflectedEye, solarView))
      const glint = pow(alignment, 350).mul(8).add(pow(alignment, 35).mul(0.12))
      // `finish` runs after the summed light: replace it, as the GLSL replaces `outgoingLight`.
      builder.context.outgoingLight.assign(
        diffuseColor.rgb
          .mul(strength)
          .mul(0.8)
          .mul(mix(0.4, 1, shadow))
          .add(vec3(glint.mul(strength))),
      )
    }
  }
  twin.setupLightingModel = () => new SeaLighting()
}

/**
 * `treeInstances` crown patch (vegetation.ts): the horizontal crown is lifted by the tree's
 * height and hidden at grazing view angles, in colour and shadow passes. Node positions run after
 * instancing, so the GLSL unit-space lift is applied here in metres (`treeHeight` is the
 * per-instance height the WebGPU substitute adds to the geometry).
 */
export function crownNodes(twin: NodeTwin, { tsl }: NodeKit): void {
  const t = tsl as N
  const {
    attribute,
    positionLocal,
    vec3,
    min,
    max,
    abs,
    dot,
    normalize,
    modelViewMatrix,
    positionView,
    vec4,
    varying,
    smoothstep,
    mix,
    materialOpacity,
    texture,
    uv,
    uniform,
  } = t
  const crown = attribute('crownCard', 'float')
  const height = max(attribute('treeHeight', 'float'), 0.001)
  twin.positionNode = positionLocal.add(
    vec3(0, crown.mul(min(2.5, height.mul(0.5)).sub(height.mul(0.5))), 0),
  )
  const up = normalize(modelViewMatrix.mul(vec4(0, 1, 0, 0)).xyz)
  const facing = abs(dot(up, normalize(positionView.negate())))
  const visibility = varying(mix(1, smoothstep(0.18, 0.5, facing), crown))
  twin.opacityNode = materialOpacity.mul(visibility)
  if (twin.map) {
    const alphaTest = uniform(twin.alphaTest)
    twin.maskShadowNode = texture(twin.map, uv()).a.mul(visibility).greaterThanEqual(alphaTest)
  }
}
