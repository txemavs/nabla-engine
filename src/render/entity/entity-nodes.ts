import type * as THREE from 'three'
import { addWebGPUMaterialNodes } from '../webgpu-substitutes.js'
import { displayBlend } from './particle-nodes.js'

/**
 * TSL twins of the `onBeforeCompile` patches on entity materials (billboard foliage, the avatar
 * helmet, destruction fire and flames), drawn by the WebGPU backend only. Each follows the GLSL
 * patch next to the call site.
 */

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Twin = THREE.Material & Record<string, N>
type Live = { value: number }

/**
 * A `toneMapped: false` transparent colour blended as WebGL does: in display space over the frame
 * below on screen, raw into a target. The twin is marked tone-mapped so the backend's display twin
 * does not decode it a second time (the output pass tone-maps the whole frame either way).
 */
function blendDisplay(t: N, twin: Twin, rgb: N, alpha: N): N {
  twin.toneMapped = true
  // Copied before each draw: fire and flames overlap, so the frame-wide shared copy is stale.
  const frame = t.viewportTexture(t.screenUV)
  frame.updateBeforeType = 'object'
  const out = t.output
  twin.outputNode = displayBlend(t, t.sRGBTransferOETF(out.rgb), out.a, out, frame)
  return t.vec4(rgb, alpha)
}

const live = (t: N, source: Live) => t.uniform(source.value).onRenderUpdate(() => source.value)

/** The material colour times its map, as `map_fragment` / `color_fragment` leave `diffuseColor`. */
function diffuse(t: N, twin: Twin, uv?: N): N {
  const color = t.vec4(t.uniform(twin.color), 1)
  if (!twin.map) return color
  return color.mul(t.texture(twin.map, uv ?? t.uv()).onRenderUpdate(() => twin.map))
}

/** `softenFoliage` (billboard.ts): desaturate the map texel. */
export function foliageNodes(material: THREE.Material, saturation: number): void {
  addWebGPUMaterialNodes(material, ({ tsl }, target) => {
    const t = tsl as N
    const twin = target as Twin
    const base = diffuse(t, twin)
    const luminance = t.dot(base.rgb, t.vec3(0.2126, 0.7152, 0.0722))
    twin.colorNode = t.vec4(t.mix(t.vec3(luminance), base.rgb, saturation), base.a)
  })
}

/** The helmet shell aperture (avatar.ts `shell`): the same discards on the raw position. */
function shellDiscard(t: N, p: N): void {
  const edge = t.abs(p.x).div(0.155)
  const borderY = t.sqrt(t.max(0.015, t.float(1).sub(t.pow(edge, 8)))).mul(0.08)
  t.If(t.abs(p.x).greaterThan(0.16).and(t.length(p.yz).lessThan(0.041)), () => t.Discard())
  t.If(
    p.z
      .lessThan(0)
      .and(edge.lessThan(1))
      .and(p.y.greaterThan(t.float(0.015).sub(borderY)))
      .and(p.y.lessThan(t.float(0.0175).add(borderY.mul(0.5)))),
    () => t.Discard(),
  )
}

export function avatarShellNodes(material: THREE.Material): void {
  addWebGPUMaterialNodes(material, ({ tsl }, target) => {
    const t = tsl as N
    const twin = target as Twin
    const base = diffuse(t, twin)
    twin.colorNode = t.Fn(() => {
      const p = t.positionGeometry
      shellDiscard(t, p)
      const crown = t
        .float(1)
        .sub(t.smoothstep(0.036, 0.043, t.abs(p.x)))
        .mul(t.smoothstep(0.07, 0.1, p.y))
      const side = t.smoothstep(0.11, 0.14, t.abs(p.x)).mul(t.smoothstep(-0.08, -0.02, p.z))
      return t.vec4(base.rgb.mul(t.float(1).sub(crown.mul(0.27)).sub(side.mul(0.12))), base.a)
    })()
  })
}

/** Foam grain (avatar.ts `foam`); `lining` adds the inner aperture, `black` the display surround. */
export function avatarFoamNodes(material: THREE.Material, mode: 'foam' | 'lining' | 'black'): void {
  addWebGPUMaterialNodes(material, ({ tsl }, target) => {
    const t = tsl as N
    const twin = target as Twin
    if (mode === 'black') {
      // `outgoingLight = vec3(0.0)`: no light or emission, alpha unchanged.
      twin.colorNode = t.vec4(0, 0, 0, t.uniform(twin.opacity))
      twin.lights = false
      return
    }
    const base = diffuse(t, twin)
    twin.colorNode = t.Fn(() => {
      const p = t.positionGeometry
      if (mode === 'lining') shellDiscard(t, p.div(0.96))
      const grain = t.fract(
        t.sin(t.dot(t.floor(p.mul(1000)), t.vec3(12.9898, 78.233, 37.719))).mul(43758.5453),
      )
      return t.vec4(base.rgb.mul(grain.mul(0.4).add(0.75)), base.a)
    })()
  })
}

/** The avatar's monitor face (avatar.ts `screenMaterial`): matrix uv, pixel mask, face light. */
export function avatarScreenNodes(
  material: THREE.Material,
  matrixMode: Live,
  faceLight: Live,
  columns: number,
  rows: number,
): void {
  addWebGPUMaterialNodes(material, ({ tsl }, target) => {
    const t = tsl as N
    const twin = target as Twin
    const mode = live(t, matrixMode)
    const light = live(t, faceLight)
    twin.colorNode = t.Fn(() => {
      const mapUv = t.uv()
      const matrixUv = t.vec2(mapUv.x, mapUv.y.sub(0.5).mul(1.45).add(0.5)).toVar()
      const mouth = t.float(1).sub(t.step(0.375, matrixUv.y))
      matrixUv.y.addAssign(mouth.mul(0.3))
      const faceMask = t.float(1).sub(mouth.mul(t.step(0.375, matrixUv.y)))
      const monitorUv = t.mix(mapUv, matrixUv, mode)
      const base = diffuse(t, twin, monitorUv)
      const cell = t.fract(monitorUv.mul(t.vec2(columns, rows)))
      const mask = t
        .step(0.12, cell.x)
        .mul(t.step(cell.x, 0.88))
        .mul(t.step(0.12, cell.y))
        .mul(t.step(cell.y, 0.88))
        .mul(t.step(0, monitorUv.y))
        .mul(t.step(monitorUv.y, 1))
        .mul(faceMask)
      const pixels = t.mix(t.vec3(0.0003, 0.0008, 0.002), base.rgb, mask)
      const rgb = t.mix(t.mix(base.rgb, pixels, mode), t.vec3(1), light)
      return t.vec4(rgb, base.a)
    })()
  })
}

/** Burst fire (vehicle-destruction.ts `createFire`). */
export function fireNodes(material: THREE.Material, clock: Live): void {
  addWebGPUMaterialNodes(material, ({ tsl }, target) => {
    const t = tsl as N
    const twin = target as Twin
    const time = live(t, clock)
    const base = diffuse(t, twin)
    twin.colorNode = t.Fn(() => {
      const p = t.positionGeometry
      const flicker = t.sin(p.x.mul(17).add(time.mul(24))).mul(t.sin(p.z.mul(13).sub(time.mul(19))))
      const heat = t.clamp(t.float(0.75).sub(p.y.mul(0.5)).add(flicker.mul(0.18)), 0, 1)
      const rgb = t.mix(t.vec3(1, 0.12, 0.015), t.vec3(1, 0.92, 0.3), heat)
      const fade = t.clamp(flicker.mul(0.5).add(0.65).sub(t.max(0, p.y).mul(0.4)), 0, 1)
      return blendDisplay(t, twin, rgb, base.a.mul(fade))
    })()
  })
}

/** Wreck flame sheets (vehicle-destruction.ts `createFlames`): sway in the vertex, tongues. */
export function flameNodes(material: THREE.Material, clock: Live): void {
  addWebGPUMaterialNodes(material, ({ tsl }, target) => {
    const t = tsl as N
    const twin = target as Twin
    const time = live(t, clock)
    const base = diffuse(t, twin)
    const uv = t.uv()
    const p = t.positionGeometry
    const h2 = uv.y.mul(uv.y)
    twin.positionNode = t.vec3(
      p.x.add(
        t
          .sin(uv.y.mul(7).sub(time.mul(5)))
          .mul(h2)
          .mul(0.09),
      ),
      p.y,
      p.z.add(
        t
          .sin(uv.y.mul(5).sub(time.mul(3.7)))
          .mul(h2)
          .mul(0.055),
      ),
    )
    twin.colorNode = t.Fn(() => {
      const h = uv.y
      const sway = t
        .sin(h.mul(9).sub(time.mul(8)))
        .mul(0.08)
        .mul(h)
      const x = t.abs(uv.x.sub(0.5).sub(sway))
      const width = t.max(0.001, t.float(1).sub(h).mul(0.38))
      const tongues = t
        .sin(uv.x.mul(25).add(time.mul(11)))
        .mul(0.07)
        .add(t.sin(uv.x.mul(43).sub(time.mul(7))).mul(0.04))
      const edge = t.float(1).sub(t.smoothstep(width.mul(0.55), width, x))
      const tip = t.float(1).sub(t.smoothstep(tongues.add(0.72), tongues.add(0.95), h))
      const turbulence = t
        .sin(h.mul(22).sub(time.mul(10)).add(uv.x.mul(13)))
        .mul(0.14)
        .add(0.78)
        .add(t.sin(h.mul(37).sub(time.mul(16))).mul(0.08))
      const alpha = edge
        .mul(tip)
        .mul(t.smoothstep(0, 0.08, h))
        .mul(turbulence)
      t.If(alpha.lessThan(0.02), () => t.Discard())
      const rgb = t.mix(t.vec3(1, 0.82, 0.18), t.vec3(1, 0.13, 0.015), h)
      return blendDisplay(t, twin, rgb, base.a.mul(alpha).mul(0.8))
    })()
  })
}
