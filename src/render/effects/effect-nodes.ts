import * as THREE from 'three'
import { focusTuning } from '../../config/gameplay-tuning.js'
import type { NodeKit, WebGPUSubstitute } from '../webgpu-substitutes.js'

/**
 * TSL twins of the depth of field and FSR 1 passes (depth-of-field.ts, fsr1.ts, fsr1-shaders.ts),
 * drawn by the WebGPU backend only. Full-screen passes read their inputs at the fragment's pixel
 * (`screenUV` / `screenCoordinate`); WebGPU render-target rows run top-down like those, so no
 * flip is needed.
 */

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Uniforms = Record<string, { value: N }>

const placeholder = new THREE.Texture()
const depthPlaceholder = new THREE.DepthTexture(1, 1)

/** A texture node that follows `uniform.value` every frame (clones made by `.load` follow it). */
function liveTexture(t: N, uniform: { value: N }, fallback: THREE.Texture): N {
  const node = t.texture(uniform.value ?? fallback)
  return Object.assign(node, {
    sync: () => {
      node.value = uniform.value ?? fallback
    },
  })
}

function fullScreen(webgpu: NodeKit['webgpu'], name: string) {
  const material = new webgpu.MeshBasicNodeMaterial()
  material.depthTest = false
  material.depthWrite = false
  material.fog = false
  material.name = `${name} (WebGPU)`
  return material
}

/** Distance along the view ray from a depth-buffer value (the renderer's depth encoding). */
function viewDistance(t: N, depth: N, near: N, far: N, logarithmic: boolean): N {
  return logarithmic
    ? t.logarithmicDepthToViewZ(depth, near, far).negate()
    : t.perspectiveDepthToViewZ(depth, near, far).negate()
}

/**
 * The depth of field gather (`DepthOfField`): far blur beyond the centre's distance plus the
 * peripheral near blur while aiming, over the linear scene colour; the output pass tone-maps it.
 */
export function depthOfFieldMaterial(base: THREE.ShaderMaterial, near: { value: number }) {
  return ({ webgpu, tsl, logarithmicDepth }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const u = base.uniforms as Uniforms
    const color = liveTexture(t, u.colorTex, placeholder)
    const depth = liveTexture(t, u.depthTex, depthPlaceholder)
    const texel = t.uniform(u.texel.value)
    const far = t.uniform(1000).onRenderUpdate(() => u.cameraFar.value)
    const nearU = t.uniform(0.1).onRenderUpdate(() => near.value)
    const radius = t.uniform(5).onRenderUpdate(() => u.radius.value)
    const tunnel = t.uniform(0).onRenderUpdate(() => u.tunnel.value)
    const farBlur = t.uniform(1).onRenderUpdate(() => u.farBlur.value)
    const material = fullScreen(webgpu, 'Depth of field')
    material.vertexNode = t.vec4(t.positionGeometry.xy, 0, 1)
    const distanceAt = (uv: N) =>
      viewDistance(t, depth.sample(uv).x, nearU, far, !!logarithmicDepth)
    material.colorNode = t.Fn(() => {
      const uv = t.screenUV
      const dist = distanceAt(uv)
      const center = distanceAt(t.vec2(0.5))
      const sides = t.smoothstep(focusTuning.sideStart, focusTuning.sideEnd, t.abs(uv.x.sub(0.5)))
      const nearField = t
        .float(1)
        .sub(t.smoothstep(focusTuning.nearStartMetres, focusTuning.nearEndMetres, dist))
      const peripheral = sides.mul(nearField).mul(tunnel)
      const coc = t.max(farBlur.mul(t.smoothstep(center, center.mul(3).add(120), dist)), peripheral)
      const own = color.sample(uv)
      const result = own.rgb.toVar()
      t.If(coc.greaterThan(0.02), () => {
        const sum = own.rgb.toVar()
        const weight = t.float(1).toVar()
        const radiusPx = coc.mul(radius)
        const offsets = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [0.707, 0.707],
          [-0.707, 0.707],
          [0.707, -0.707],
          [-0.707, -0.707],
        ]
        for (const [x, y] of offsets) {
          const at = uv.add(t.vec2(x, y).mul(radiusPx).mul(texel))
          t.If(distanceAt(at).add(0.5).greaterThanEqual(dist), () => {
            sum.addAssign(color.sample(at).rgb)
            weight.addAssign(1)
          })
        }
        result.assign(sum.div(weight))
      })
      return t.vec4(result, own.a)
    })()
    return {
      material,
      sync: () => {
        color.sync()
        depth.sync()
      },
    }
  }
}

/** `OutputPass` into the 8-bit FSR input: tone map and sRGB-encode the linear frame. */
export function fsrEncodeMaterial(source: { value: N }) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const input = liveTexture(t, source, placeholder)
    const material = fullScreen(webgpu, 'FSR1 encode')
    material.vertexNode = t.vec4(t.positionGeometry.xy, 0, 1)
    const c = input.sample(t.screenUV)
    material.colorNode = t.vec4(
      t.sRGBTransferOETF(t.acesFilmicToneMapping(c.rgb, t.toneMappingExposure)),
      c.a,
    )
    return { material, sync: () => input.sync() }
  }
}

/** AMD FSR 1 EASU (fsr1-shaders.ts `easuShader`), on display-encoded texels. */
export function fsrEasuMaterial(base: THREE.ShaderMaterial) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const u = base.uniforms as Uniforms
    const input = liveTexture(t, u.inputTexture, placeholder)
    const inputSize = t.uniform(u.inputSize.value)
    const outputSize = t.uniform(u.outputSize.value)
    const material = fullScreen(webgpu, 'FSR1 EASU')
    material.vertexNode = t.vec4(t.positionGeometry.xy, 0, 1)
    const rcp = (v: N) => t.float(1).div(t.max(v, 1e-8))
    const sat = (v: N) => t.clamp(v, 0, 1)
    material.colorNode = t.Fn(() => {
      const load = (p: N) =>
        input.load(t.clamp(t.ivec2(p), t.ivec2(0), t.ivec2(inputSize).sub(1))).rgb
      const scale = inputSize.div(outputSize)
      const ip = t.floor(t.screenCoordinate.xy)
      const pp0 = ip.mul(scale).add(scale.mul(0.5).sub(0.5))
      const fp = t.floor(pp0)
      const pp = pp0.sub(fp)
      const at = (x: number, y: number) => load(fp.add(t.vec2(x, y)))
      const b = at(0, -1).toVar(),
        c = at(1, -1).toVar()
      const e = at(-1, 0).toVar(),
        f = at(0, 0).toVar(),
        g = at(1, 0).toVar(),
        h = at(2, 0).toVar()
      const i = at(-1, 1).toVar(),
        j = at(0, 1).toVar(),
        k = at(1, 1).toVar(),
        l = at(2, 1).toVar()
      const n = at(0, 2).toVar(),
        o = at(1, 2).toVar()
      const luma = (p: N) => p.b.mul(0.5).add(p.r.mul(0.5).add(p.g))
      const [bL, cL, iL, jL, fL, eL, kL, lL, hL, gL, oL, nL] = [
        b,
        c,
        i,
        j,
        f,
        e,
        k,
        l,
        h,
        g,
        o,
        n,
      ].map((p) => luma(p).toVar())
      const dir = t.vec2(0).toVar()
      const len = t.float(0).toVar()
      const set = (w: N, lA: N, lB: N, lC: N, lD: N, lE: N) => {
        const dc = lD.sub(lC)
        const cb = lC.sub(lB)
        const lenX0 = rcp(t.max(t.abs(dc), t.abs(cb)))
        const dirX = lD.sub(lB)
        dir.x.addAssign(dirX.mul(w))
        const lenX = sat(t.abs(dirX).mul(lenX0))
        len.addAssign(lenX.mul(lenX).mul(w))
        const ec = lE.sub(lC)
        const ca = lC.sub(lA)
        const lenY0 = rcp(t.max(t.abs(ec), t.abs(ca)))
        const dirY = lE.sub(lA)
        dir.y.addAssign(dirY.mul(w))
        const lenY = sat(t.abs(dirY).mul(lenY0))
        len.addAssign(lenY.mul(lenY).mul(w))
      }
      const ox = t.float(1).sub(pp.x)
      const oy = t.float(1).sub(pp.y)
      set(ox.mul(oy), bL, eL, fL, gL, jL)
      set(pp.x.mul(oy), cL, fL, gL, hL, kL)
      set(ox.mul(pp.y), fL, iL, jL, kL, nL)
      set(pp.x.mul(pp.y), gL, jL, kL, lL, oL)
      const dir2 = dir.mul(dir)
      const dirR0 = dir2.x.add(dir2.y)
      const zro = dirR0.lessThan(1 / 32768)
      const dirR = t.select(zro, t.float(1), t.inverseSqrt(t.max(dirR0, 1e-8)))
      const dirN = t
        .vec2(t.select(zro, t.float(1), dir.x), dir.y)
        .mul(dirR)
        .toVar()
      const lenH = len.mul(0.5)
      const len2s = lenH.mul(lenH)
      const stretch = dirN.x
        .mul(dirN.x)
        .add(dirN.y.mul(dirN.y))
        .mul(rcp(t.max(t.abs(dirN.x), t.abs(dirN.y))))
      const len2 = t
        .vec2(t.float(1).add(stretch.sub(1).mul(len2s)), t.float(1).sub(len2s.mul(0.5)))
        .toVar()
      const lob = t
        .float(0.5)
        .add(t.float(1 / 4 - 0.04 - 0.5).mul(len2s))
        .toVar()
      const clp = rcp(lob).toVar()
      const min4 = t.min(t.min(f, g, j), k)
      const max4 = t.max(t.max(f, g, j), k)
      const aC = t.vec3(0).toVar()
      const aW = t.float(0).toVar()
      const tap = (x: number, y: number, colour: N) => {
        const off = t.vec2(x, y).sub(pp)
        const v = t
          .vec2(
            off.x.mul(dirN.x).add(off.y.mul(dirN.y)),
            off.x.mul(dirN.y.negate()).add(off.y.mul(dirN.x)),
          )
          .mul(len2)
        const d2 = t.min(v.x.mul(v.x).add(v.y.mul(v.y)), clp)
        const wB0 = d2.mul(2 / 5).sub(1)
        const wA0 = lob.mul(d2).sub(1)
        const wB = wB0
          .mul(wB0)
          .mul(25 / 16)
          .sub(25 / 16 - 1)
        const w = wB.mul(wA0.mul(wA0))
        aC.addAssign(colour.mul(w))
        aW.addAssign(w)
      }
      tap(0, -1, b)
      tap(1, -1, c)
      tap(-1, 1, i)
      tap(0, 1, j)
      tap(0, 0, f)
      tap(-1, 0, e)
      tap(1, 1, k)
      tap(2, 1, l)
      tap(2, 0, h)
      tap(1, 0, g)
      tap(1, 2, o)
      tap(0, 2, n)
      const pix = t.min(max4, t.max(min4, aC.mul(rcp(aW))))
      return t.vec4(pix, input.sample(t.screenCoordinate.xy.div(outputSize)).a)
    })()
    return { material, sync: () => input.sync() }
  }
}

/**
 * AMD FSR 1 RCAS (fsr1-shaders.ts `rcasShader`). Its output is already display-encoded, so the
 * caller draws it with the renderer's tone mapping and colour conversion switched off.
 */
export function fsrRcasMaterial(base: THREE.ShaderMaterial) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const u = base.uniforms as Uniforms
    const input = liveTexture(t, u.inputTexture, placeholder)
    const inputSize = t.uniform(u.inputSize.value)
    const sharpness = t.uniform(0.5).onRenderUpdate(() => u.sharpness.value)
    const material = fullScreen(webgpu, 'FSR1 RCAS')
    material.vertexNode = t.vec4(t.positionGeometry.xy, 0, 1)
    material.colorNode = t.Fn(() => {
      const load = (p: N) =>
        input.load(t.clamp(t.ivec2(p), t.ivec2(0), t.ivec2(inputSize).sub(1))).rgb
      const p = t.floor(t.screenCoordinate.xy)
      const b = load(p.add(t.vec2(0, -1))).toVar(),
        d = load(p.add(t.vec2(-1, 0))).toVar()
      const e = load(p).toVar(),
        f = load(p.add(t.vec2(1, 0))).toVar(),
        h = load(p.add(t.vec2(0, 1))).toVar()
      const mn = t.min(t.min(b, d), t.min(f, h))
      const mx = t.max(t.max(b, d), t.max(f, h))
      const hitMin = t.min(mn, e).div(t.max(mx.mul(4), t.vec3(1e-8)))
      const hitMax = t
        .vec3(1)
        .sub(t.max(mx, e))
        .div(t.min(mn.mul(4).sub(4), t.vec3(-1e-8)))
      const lobes = t.max(hitMin.negate(), hitMax)
      const lobe = t.max(-0.1875, t.min(t.max(lobes.r, t.max(lobes.g, lobes.b)), 0)).mul(sharpness)
      const sum = b.add(d).add(f).add(h)
      const rgb = t.clamp(lobe.mul(sum).add(e).div(lobe.mul(4).add(1)), 0, 1)
      return t.vec4(rgb, input.load(t.ivec2(p)).a)
    })()
    return { material, sync: () => input.sync() }
  }
}
