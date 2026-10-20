import type * as THREE from 'three'
import { NoBlending } from 'three'
import type { NodeKit, WebGPUSubstitute } from '../webgpu-substitutes.js'
import { decodeDisplay } from './sky-nodes.js'

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * `createLensFlare` (lens-flare.ts) as a node material. WebGL adds the raw glow onto the displayed
 * frame; the WebGPU frame is linear until its output pass, so the twin reads the frame below
 * (`viewportSharedTexture`), adds the glow in display space and writes back its decode. One
 * full-screen triangle, so the read is exact. Depth follows the GLSL: the source's depth when
 * positional, else just in front of the far plane.
 */
export function lensFlareMaterial(base: THREE.ShaderMaterial) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const u = base.uniforms
    const sunDirection = t.uniform(u.sunDirection.value)
    const sourcePosition = t.uniform(u.sourcePosition.value)
    const positional = t.uniform(0).onRenderUpdate(() => u.positional.value)
    const aspect = t.uniform(1).onRenderUpdate(() => u.aspect.value)
    const intensity = t.uniform(1).onRenderUpdate(() => u.intensity.value)
    const tileRect = t.uniform(u.tileRect.value)
    const { vec2, vec3, vec4, float, exp, dot, length, smoothstep, mix, normalize, If, Discard } = t
    const view = t.cameraViewMatrix
    const projection = t.cameraProjectionMatrix
    const material = new webgpu.MeshBasicNodeMaterial()
    const source = projection.mul(view).mul(vec4(sourcePosition, 1))
    const clipDepth = positional
      .greaterThan(0.5)
      .select(source.z.div(t.max(0.001, source.w)), 0.999)
    material.vertexNode = vec4(t.positionGeometry.xy, 0.5, 1)
    // WebGPU clip depth is [0, 1]; the GLSL's 0.999 is in WebGL's [-1, 1].
    material.depthNode = t.varying(
      positional.greaterThan(0.5).select(clipDepth, float(0.999).mul(0.5).add(0.5)),
    )
    const blob = (uv: N, at: N, sharp: number) => {
      const d = uv.sub(at).mul(vec2(aspect, 1))
      return exp(dot(d, d).negate().mul(sharp))
    }
    material.colorNode = t.Fn(() => {
      If(intensity.lessThanEqual(0.001), () => Discard())
      const vUv = t.uv()
      const fullUv = tileRect.xy.add(vUv.mul(tileRect.zw))
      const viewDir = positional
        .greaterThan(0.5)
        .select(
          view.mul(vec4(sourcePosition, 1)).xyz,
          view.mul(vec4(normalize(sunDirection), 0)).xyz,
        )
        .toVar()
      If(
        viewDir.z
          .greaterThan(-0.001)
          .or(positional.lessThan(0.5).and(sunDirection.y.lessThan(-0.02))),
        () => Discard(),
      )
      const ndc = vec2(
        viewDir.x.div(viewDir.z.negate()).mul(projection.element(0).x).mul(tileRect.z),
        viewDir.y.div(viewDir.z.negate()).mul(projection.element(1).y).mul(tileRect.w),
      )
      const radial = length(ndc)
      If(radial.greaterThan(1.4), () => Discard())
      const sun = ndc.mul(0.5).add(0.5)
      const aimed = smoothstep(0.15, 0.9, radial).oneMinus()
      const cover = smoothstep(0.95, 1.3, radial)
        .oneMinus()
        .mul(mix(0.35, 1, aimed))
      const axis = sun.sub(0.5)
      const across = normalize(vec2(axis.y.negate(), axis.x).mul(vec2(aspect, 1)).add(0.0001))
      const rel = fullUv.sub(sun).mul(vec2(aspect, 1))
      const side = dot(rel, across)
      const streak = exp(side.mul(side).mul(-900)).mul(exp(dot(rel, rel).mul(-22)))
      const glow = vec3(1, 0.94, 0.8)
        .mul(
          blob(fullUv, sun, 18)
            .mul(0.42)
            .add(blob(fullUv, sun, 5.5).mul(0.1))
            .add(streak.mul(0.08)),
        )
        .mul(cover)
        .mul(intensity)
      const below = t.viewportSharedTexture(t.screenUV).rgb
      const shown = t.sRGBTransferOETF(t.acesFilmicToneMapping(below, t.toneMappingExposure))
      return vec4(decodeDisplay(t.min(shown.add(glow), vec3(1)), t), 1)
    })()
    material.blending = NoBlending
    material.transparent = true
    material.depthTest = base.depthTest
    material.depthWrite = false
    material.fog = false
    material.name = 'Lens flare (WebGPU)'
    return { material }
  }
}
