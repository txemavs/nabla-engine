import * as THREE from 'three'
import { decodeDisplay } from '../planet/sky-nodes.js'
import type { NodeKit, WebGPUSubstitute } from '../webgpu-substitutes.js'
import { onScreen } from './particle-nodes.js'

/**
 * TSL twins of the shot laser's beam and halo (shot-laser.ts), drawn by the WebGPU backend only.
 * Both are additive and `toneMapped: false`: WebGL adds them onto the displayed frame, so on
 * screen the twins read the frame below (copied per draw), add in display space and write back
 * the decode; into a render target the raw colour is added as is.
 */

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any

function additive(t: N, color: N, alpha: N): N {
  const frame = t.viewportTexture(t.screenUV)
  frame.updateBeforeType = 'object'
  const below = frame.rgb
  const glow = t.sRGBTransferOETF(color).mul(alpha)
  const shown = t.sRGBTransferOETF(t.acesFilmicToneMapping(below, t.toneMappingExposure))
  const screen = decodeDisplay(t.min(shown.add(glow), t.vec3(1)), t)
  return t.vec4(onScreen(t).select(screen, below.add(color.mul(alpha))), 1)
}

function laserMaterial(webgpu: NodeKit['webgpu'], base: THREE.ShaderMaterial, name: string) {
  const material = new webgpu.MeshBasicNodeMaterial()
  material.side = base.side
  material.transparent = true
  material.depthWrite = false
  material.depthTest = base.depthTest
  material.blending = THREE.NoBlending
  material.polygonOffset = base.polygonOffset
  material.polygonOffsetFactor = base.polygonOffsetFactor
  material.polygonOffsetUnits = base.polygonOffsetUnits
  material.fog = false
  material.name = `${name} (WebGPU)`
  return material
}

/** The beam ribbon: constant pixel width between `start` and `end`, smoke-lit along its length. */
export function laserBeamMaterial(base: THREE.ShaderMaterial, widthPixels: number) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const u = base.uniforms
    const start = t.uniform(u.start.value)
    const end = t.uniform(u.end.value)
    const resolution = t.uniform(u.resolution.value)
    const smoke = t.uniformArray(Array.from(u.smoke.value as Float32Array), 'float')
    const material = laserMaterial(webgpu, base, 'Shot laser beam')
    const uv = t.uv()
    const mvp = t.cameraProjectionMatrix.mul(t.modelViewMatrix)
    const a = mvp.mul(t.vec4(start, 1))
    const b = mvp.mul(t.vec4(end, 1))
    const direction = b.xy.div(b.w).sub(a.xy.div(a.w)).mul(resolution)
    const perpendicular = t.normalize(t.vec2(direction.y.negate(), direction.x).add(1e-5))
    const position = t.mix(a, b, uv.y)
    const offset = perpendicular.mul(uv.x.sub(0.5)).mul(widthPixels).div(resolution).mul(position.w)
    material.vertexNode = t.vec4(position.xy.add(offset), position.z, position.w)
    // Cancel perspective interpolation across this constant-pixel-width ribbon.
    const acrossW = t.varying(uv.x.mul(position.w))
    const clipW = t.varying(position.w)
    material.colorNode = t.Fn(() => {
      const s = t.clamp(uv.y, 0, 1).mul(31)
      const i = t.int(t.floor(s))
      const fog = t.mix(smoke.element(i), smoke.element(t.min(i.add(1), 31)), t.fract(s))
      const d = t.abs(acrossW.div(clipW).sub(0.5)).mul(2)
      const halo = t.exp(d.mul(d).mul(-3))
      const core = t.exp(d.mul(d).mul(-180))
      const color = t.mix(t.vec3(1, 0.015, 0.01), t.vec3(1, 0.5, 0.35), core)
      const alpha = halo
        .mul(0.035)
        .add(core.mul(0.55))
        .add(fog.mul(halo.mul(0.7).add(core.mul(0.3))))
        .mul(t.float(1).sub(t.smoothstep(0.8, 1, d)))
      return additive(t, color, alpha)
    })()
    const values = smoke.array as number[]
    const source = u.smoke.value as Float32Array
    return {
      material,
      sync: () => {
        for (let k = 0; k < 32; k++) values[k] = source[k]
      },
    }
  }
}

/** The surface halo around the pin: a soft red disc facing the camera. */
export function laserHaloMaterial(base: THREE.ShaderMaterial, opacity: number) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const material = laserMaterial(webgpu, base, 'Shot laser halo')
    material.colorNode = t.Fn(() => {
      const r = t.length(t.uv().sub(0.5)).mul(2)
      const a = t
        .exp(r.mul(r).mul(-3))
        .mul(t.float(1).sub(t.smoothstep(0.65, 1, r)))
        .mul(opacity)
      return additive(t, t.vec3(1, 0.015, 0.005), a)
    })()
    return { material }
  }
}
