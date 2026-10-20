import type * as THREE from 'three'
import type { NodeKit, WebGPUSubstitute } from '../webgpu-substitutes.js'
import { decodeDisplay } from '../planet/sky-nodes.js'

/**
 * TSL twins of the raw GLSL smoke and tyre-mark materials, drawn by the WebGPU backend only.
 * Their GLSL writes `gl_FragColor` with no tone mapping or colour-space chunk, so the canvas shows
 * the value as is. The dark tyre marks output its sRGB decode with `toneMapped: false`, which the
 * compatibility guard maps back through the inverse tone curve for on-screen frames; the bright
 * smoke blends in display space through `displayBlend`.
 */

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Uniforms = Record<string, { value: N }>

const live = (t: N, source: { value: number }) =>
  t.uniform(source.value).onRenderUpdate(() => source.value)

/**
 * A `Points` cloud as an instanced sprite: one instance per point, sharing the GLSL geometry's
 * arrays, re-uploaded when the owner flags them. `shade` gets the instance attributes and
 * returns the point size in device pixels and the raw `gl_FragColor` (rgb, alpha) or null to
 * discard.
 */
function pointSprites(
  points: THREE.Points,
  names: string[],
  shade: (
    t: N,
    attributes: Record<string, N>,
    uniforms: Uniforms,
  ) => { size: N; color: N; alpha: N; keep: N },
) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const base = points.material as THREE.ShaderMaterial
    const geometry = points.geometry
    const sources = ['position', ...names].map(
      (name) => geometry.getAttribute(name) as THREE.BufferAttribute,
    )
    const copies = sources.map(
      (source) => new webgpu.InstancedBufferAttribute(source.array, source.itemSize),
    )
    const versions = sources.map((source) => source.version)
    const attributes: Record<string, N> = {}
    ;['position', ...names].forEach((name, i) => {
      attributes[name] = t.instancedBufferAttribute(copies[i])
    })
    const material = new webgpu.PointsNodeMaterial()
    material.positionNode = attributes.position
    const { size, color, alpha, keep } = shade(t, attributes, base.uniforms as Uniforms)
    material.sizeNode = size.div(t.screenDPR)
    material.sizeAttenuation = false
    material.colorNode = t.Fn(() => {
      t.If(keep.not(), () => t.Discard())
      return displayBlend(t, color, alpha)
    })()
    material.transparent = base.transparent
    material.depthWrite = base.depthWrite
    material.fog = false
    material.name = `${base.name || points.name || 'Points'} (WebGPU)`
    const sprite = new webgpu.Sprite(material)
    sprite.count = sources[0].count
    sprite.frustumCulled = false
    sprite.name = `${points.name || 'Points'} (WebGPU)`
    const sync = () => {
      material.visible = base.visible
      sources.forEach((source, i) => {
        if (source.version === versions[i]) return
        versions[i] = source.version
        copies[i].needsUpdate = true
      })
    }
    sync()
    return { object: sprite, sync }
  }
}

/**
 * WebGL blends the raw smoke colour `v` over the displayed (tone-mapped, encoded) frame; the
 * WebGPU frame is linear until its output pass, and the inverse tone curve of a near-white smoke
 * colour is huge, so blending its decode would blow the smoke out. Instead pick the linear colour
 * that, blended normally over the frame below, tone-maps to the WebGL result. Exact for the first
 * layer of a draw; overlapping sprites in one draw approximate it.
 */
export function displayBlend(
  t: N,
  color: N,
  alpha: N,
  raw: N = t.vec4(color, alpha),
  frame: N = t.viewportSharedTexture(t.screenUV),
): N {
  // Render targets (mirrors) have no output pass in either backend: the raw colour blends as is.
  const below = frame.rgb
  const shown = t.sRGBTransferOETF(t.acesFilmicToneMapping(below, t.toneMappingExposure))
  const target = decodeDisplay(t.mix(shown, color, alpha), t)
  const a = t.max(alpha, 1e-3)
  const screen = t.vec4(target.sub(below.mul(a.oneMinus())).div(a), alpha)
  return onScreen(t).select(screen, raw)
}

/** True while the renderer draws to the canvas (through its output pass), false into a target. */
export const onScreen = (t: N) =>
  t
    .uniform(1)
    .onRenderUpdate(({ renderer }: N) => {
      // On screen the renderer draws into its own framebuffer target before the output pass.
      const target = renderer.getRenderTarget()
      return target === null || target.isPostProcessingRenderTarget === true ? 1 : 0
    })
    .greaterThan(0.5)

/** Radial falloff of the GLSL `length(gl_PointCoord-0.5)*2.0` (sprite quads carry it in `uv`). */
const pointDistance = (t: N) => t.length(t.uv().sub(0.5)).mul(2)

/** `TireSmoke` (tire-smoke.ts). */
export function tireSmokeSprites(points: THREE.Points) {
  return pointSprites(points, ['life'], (t, { life }, u) => {
    const pixelRatio = live(t, u.pixelRatio)
    const density = live(t, u.smokeDensity)
    const view = t.positionView
    const size = life
      .greaterThan(0)
      .select(
        t.clamp(
          t.float(1.8).sub(life).mul(160).mul(pixelRatio).div(t.max(1, view.z.negate())),
          1,
          80,
        ),
        0,
      )
    const age = t.varying(life)
    const d = pointDistance(t)
    return {
      size,
      color: t.vec3(0.65, 0.67, 0.69),
      alpha: d.oneMinus().mul(d.oneMinus()).mul(age).mul(0.24).mul(density),
      keep: d.lessThanEqual(1).and(age.greaterThan(0)),
    }
  })
}

/** `MuzzleSmoke` (muzzle-smoke.ts). */
export function muzzleSmokeSprites(points: THREE.Points) {
  return pointSprites(points, ['age'], (t, { age: ageAttribute }, u) => {
    const height = live(t, u.height)
    const density = live(t, u.smokeDensity)
    const projection = t.cameraProjectionMatrix.element(1).y
    const size = ageAttribute
      .greaterThanEqual(0)
      .select(
        t.clamp(
          t
            .float(0.009)
            .add(ageAttribute.mul(0.06))
            .mul(height)
            .mul(projection)
            .div(t.max(0.05, t.positionView.z.negate())),
          1,
          100,
        ),
        0,
      )
    const age = t.varying(ageAttribute)
    const d = pointDistance(t)
    return {
      size,
      color: t.vec3(0.85, 0.87, 0.89),
      alpha: t.pow(d.oneMinus(), 2).mul(age.div(0.7).oneMinus()).mul(0.32).mul(density),
      keep: age.greaterThanEqual(0).and(d.lessThanEqual(1)),
    }
  })
}

/** `ExhaustSmoke` (exhaust-smoke.ts). */
export function exhaustSmokeSprites(points: THREE.Points) {
  return pointSprites(points, ['life', 'tint'], (t, { life, tint }, u) => {
    const size = live(t, u.size)
    const lifetime = live(t, u.lifetime)
    const density = live(t, u.smokeDensity)
    const pointSize = life
      .greaterThan(0)
      .select(
        t.clamp(
          life.div(lifetime).oneMinus().mul(1.4).mul(size).div(t.max(1, t.positionView.z.negate())),
          1,
          240,
        ),
        0,
      )
    const age = t.varying(life)
    const d = pointDistance(t)
    return {
      size: pointSize,
      color: t.varying(tint),
      alpha: t.pow(d.oneMinus(), 2).mul(age.div(lifetime)).mul(0.4).mul(density),
      keep: d.lessThanEqual(1).and(age.greaterThan(0)),
    }
  })
}

/** `TireMarks` (tire-marks.ts): the same ring-buffer mesh with a node material. */
export function tireMarkMaterial(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const base = mesh.material
    const u = base.uniforms as Uniforms
    const clock = live(t, u.clock)
    const lifetime = live(t, u.lifetime)
    const markUv = t.uv()
    const age = clock.sub(t.attribute('born', 'float'))
    const opacity = t.attribute('strength', 'float')
    const tint = t.attribute('tint', 'vec3')
    const material = new webgpu.MeshBasicNodeMaterial()
    material.colorNode = t.Fn(() => {
      const fade = t.smoothstep(lifetime.mul(0.65), lifetime, age).oneMinus()
      const edge = t.smoothstep(0, 0.12, markUv.x).mul(t.smoothstep(0, 0.12, markUv.x.oneMinus()))
      const grooves = t.cos(markUv.x.mul(38)).mul(0.18).add(0.82)
      const alpha = fade.mul(edge).mul(grooves).mul(opacity).mul(0.48)
      t.If(alpha.lessThan(0.005), () => t.Discard())
      return t.vec4(onScreen(t).select(t.sRGBTransferEOTF(tint), tint), alpha)
    })()
    material.transparent = base.transparent
    material.depthWrite = base.depthWrite
    material.side = base.side
    material.toneMapped = false
    material.name = 'Transient tyre marks (WebGPU)'
    return { material, sync: () => (material.visible = base.visible) }
  }
}
