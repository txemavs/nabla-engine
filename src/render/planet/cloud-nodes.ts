import type * as THREE from 'three'
import { NoBlending } from 'three'
import type { NodeKit, WebGPUSubstitute } from '../webgpu-substitutes.js'
import { noiseNodes } from './noise-nodes.js'
import { copyState, decodeDisplay } from './sky-nodes.js'

/**
 * TSL twins of the cloud `ShaderMaterial`s (clouds.ts, artistic-clouds.ts), drawn by the WebGPU
 * backend only. Each follows its GLSL source line by line.
 */

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any
type Uniforms = Record<string, { value: N }>

/** `createCloudLayer`: four analytic puffs on a back-faced dome (sky pass, display space). */
export function lowCloudDome(base: THREE.ShaderMaterial) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const { uniform, normalize, positionWorld, cameraPosition, dot, cos, sin, vec3, vec4, exp } = t
    const { max, smoothstep, pow, clamp, mix, float, Fn, If, Discard } = t
    const u = base.uniforms as Uniforms
    const sunU = uniform(u.sunDirection.value)
    const coverage = uniform(0)
    const hours = uniform(0)
    const puffs = (u.puffs.value as THREE.Vector4[]).map((v) => uniform(v))
    const material = new webgpu.MeshBasicNodeMaterial()
    material.colorNode = Fn(() => {
      const ray = normalize(positionWorld.sub(cameraPosition))
      const sun = normalize(sunU)
      const puff = float(0).toVar()
      const shade = float(0).toVar()
      puffs.forEach((p, i) => {
        const turn = hours.mul(0.22 + i * 0.05)
        const cs = cos(turn)
        const sn = sin(turn)
        const moved = normalize(
          vec3(p.x.mul(cs).sub(p.z.mul(sn)), p.y, p.x.mul(sn).add(p.z.mul(cs))),
        )
        const falloff = exp(max(0, dot(ray, moved).oneMinus()).negate().mul(p.w))
        puff.addAssign(falloff)
        shade.addAssign(falloff.mul(dot(moved, sun)))
      })
      const alpha = exp(puff.negate().mul(1.15))
        .oneMinus()
        .mul(smoothstep(0.02, 0.28, ray.y))
        .mul(coverage)
        .mul(smoothstep(0.993, 0.9994, dot(ray, sun)).oneMinus())
        .toVar()
      If(alpha.lessThan(0.004), () => {
        Discard()
      })
      const scatter = pow(max(dot(ray, sun), 0), 6)
      const lit = clamp(shade.mul(0.55).add(0.28).add(scatter.mul(0.3)), 0, 1)
      return vec4(mix(vec3(0.72, 0.76, 0.82), vec3(1, 0.99, 0.97), lit), alpha.mul(0.72))
    })()
    material.opacityNode = (material.colorNode as N).a
    copyState(base, material)
    // Raw output, as the GLSL (no <tonemapping_fragment>/<colorspace_fragment>).
    const sync = () => {
      copyState(base, material)
      coverage.value = u.coverage.value
      hours.value = u.dayHours.value
    }
    sync()
    return { material, sync }
  }
}

/** `createGlobeClouds`: the fbm skin on the globe seen from orbit (sky pass, display space). */
export function globeCloudSkin(base: THREE.ShaderMaterial) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const {
      uniform,
      normalize,
      positionLocal,
      positionWorld,
      cameraPosition,
      normalWorldGeometry,
    } = t
    const { dot, atan, vec2, vec3, vec4, mix, smoothstep, pow, abs, Fn, If, Discard } = t
    const { fbm } = noiseNodes(tsl)
    const u = base.uniforms as Uniforms
    const sunU = uniform(u.sunDirection.value)
    const coverage = uniform(0)
    const hours = uniform(0)
    const amount = uniform(0)
    const material = new webgpu.MeshBasicNodeMaterial()
    material.colorNode = Fn(() => {
      const local = normalize(positionLocal)
      const p = vec2(atan(local.z, local.x), local.y).mul(4.2)
      const wind = hours.mul(0.12)
      const f = fbm(p.add(vec2(wind, wind.mul(0.35))))
      const thresh = mix(0.92, 0.18, amount)
      const cloud = smoothstep(thresh, thresh.add(0.16), f)
      const N0 = normalize(normalWorldGeometry)
      const V = normalize(cameraPosition.sub(positionWorld))
      const rim = pow(abs(dot(N0, V)).oneMinus(), 1.35)
      const lit = smoothstep(-0.06, 0.22, dot(N0, normalize(sunU)))
      const body = mix(0.16, 0.9, amount)
      const alpha = cloud
        .mul(body.add(rim.mul(body.oneMinus()).mul(0.4)))
        .mul(coverage)
        .mul(lit)
        .toVar()
      If(alpha.lessThan(0.02), () => {
        Discard()
      })
      return vec4(mix(vec3(0.12, 0.13, 0.16), vec3(0.96, 0.97, 0.98), lit), alpha)
    })()
    material.opacityNode = (material.colorNode as N).a
    copyState(base, material)
    // Raw output, as the GLSL (no <tonemapping_fragment>/<colorspace_fragment>).
    const sync = () => {
      copyState(base, material)
      coverage.value = u.coverage.value
      hours.value = u.dayHours.value
      amount.value = u.amount.value
    }
    sync()
    return { material, sync }
  }
}

/**
 * `createArtisticClouds`: the full-screen ray-marched decks drawn over the world, with the hit
 * depth written so terrain in front occludes them. The GLSL writes its colour raw (no tone
 * mapping or sRGB chunks) and blends over the display-space frame, so the twin does the blend
 * itself on a copy of the frame and writes the result through `decodeDisplay`.
 */
export function artisticCloudDeck(base: THREE.ShaderMaterial) {
  return ({ webgpu, tsl, logarithmicDepth }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const { uniform, normalize, positionGeometry, cameraPosition, cameraWorldMatrix, mat3 } = t
    const { cameraProjectionMatrixInverse, cameraViewMatrix, cameraNear, cameraFar, varying } = t
    const { dot, max, min, abs, pow, step, vec3, vec4, mix, smoothstep, clamp, float } = t
    const { Fn, If, Discard, Loop, select, viewportSharedTexture, screenUV } = t
    const { sRGBTransferOETF, acesFilmicToneMapping, toneMappingExposure } = t
    const { viewZToLogarithmicDepth, viewZToPerspectiveDepth } = t
    const { cumulus, alto, cirrus } = noiseNodes(tsl)
    const u = base.uniforms as Uniforms
    const names = [
      'coverage',
      'dayHours',
      'golden',
      'day',
      'amount',
      'storm',
      'cumBase',
      'cumThick',
      'altoBase',
      'altoThick',
      'cirBase',
      'cirThick',
    ]
    const v: Record<string, N> = {}
    for (const name of names) v[name] = uniform(u[name].value)
    const sunU = uniform(u.sunDirection.value)
    const origin = uniform(u.cloudOrigin.value)
    const material = new webgpu.MeshBasicNodeMaterial()
    material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    const view = cameraProjectionMatrixInverse.mul(vec4(positionGeometry.xy, 1, 1))
    const rayDir = varying(mat3(cameraWorldMatrix).mul(view.xyz.div(view.w)))
    const sample = (xz: N, thresh: N, kind: number) =>
      kind === 0
        ? cumulus(xz, v.dayHours, thresh)
        : kind === 1
          ? alto(xz, v.dayHours, thresh)
          : cirrus(xz, v.dayHours, thresh)
    const march = (ro: N, rd: N, y0: N, y1: N, kind: number, thresh: N) => {
      const alpha = float(0).toVar()
      const tHit = float(-1).toVar()
      const t0 = float(0).toVar()
      const t1 = float(180000).toVar()
      const valid = float(1).toVar()
      If(abs(rd.y).lessThan(0.0008), () => {
        If(ro.y.lessThan(y0).or(ro.y.greaterThan(y1)), () => {
          valid.assign(0)
        })
      }).Else(() => {
        const a = y0.sub(ro.y).div(rd.y)
        const b = y1.sub(ro.y).div(rd.y)
        t0.assign(max(min(a, b), 0))
        const far = max(a, b)
        If(far.lessThanEqual(t0).or(t0.greaterThan(500000)), () => {
          valid.assign(0)
        })
        t1.assign(t0.add(min(far.sub(t0), 180000)))
      })
      If(valid.greaterThan(0.5), () => {
        const span = max(t1.sub(t0), 1)
        const r = select(span.greaterThan(12000), float(1.9), float(1.001))
        const inv = span.div(pow(r, 6).sub(1))
        const thick = max(y1.sub(y0), 30)
        Loop(6, ({ i }: { i: N }) => {
          const ri = pow(r, float(i))
          const tt = t0.add(
            ri
              .sub(1)
              .add(ri.mul(r.sub(1)).mul(0.5))
              .mul(inv),
          )
          const p = ro.add(rd.mul(tt))
          const profile =
            kind === 0
              ? smoothstep(y0, y0.add(thick.mul(0.07)), p.y).mul(
                  smoothstep(y1.sub(thick.mul(0.55)), y1, p.y).oneMinus(),
                )
              : kind === 1
                ? smoothstep(y0, y0.add(thick.mul(0.15)), p.y).mul(
                    smoothstep(y1.sub(thick.mul(0.15)), y1, p.y).oneMinus(),
                  )
                : smoothstep(y0, y0.add(thick.mul(0.35)), p.y).mul(
                    smoothstep(y1.sub(thick.mul(0.2)), y1, p.y).oneMinus(),
                  )
          const d = sample(p.xz, thresh, kind).mul(profile)
          If(tHit.lessThan(0).and(d.greaterThan(0.15)), () => {
            tHit.assign(tt)
          })
          alpha.addAssign(d.mul(0.34).mul(alpha.oneMinus()))
        })
        If(tHit.lessThan(0).and(alpha.greaterThan(0.02)), () => {
          tHit.assign(max(t0, 40))
        })
      })
      return { alpha, tHit }
    }
    const hitDepth = float(1).toVar('nablaCloudDepth')
    material.colorNode = Fn(() => {
      const rd = normalize(rayDir)
      const ro = cameraPosition.add(origin)
      const sun = normalize(sunU)
      const mu = max(dot(rd, sun), 0)
      const thresh = clamp(mix(0.94, 0.15, v.amount).sub(v.storm.mul(0.08)), 0.05, 0.97)
      const shade = mix(
        mix(vec3(0.55, 0.6, 0.68), vec3(0.62, 0.34, 0.4), v.golden),
        vec3(0.1, 0.11, 0.13),
        v.storm,
      )
      const lit = mix(
        mix(vec3(0.98, 0.98, 0.99), vec3(1.05, 0.62, 0.22), v.golden),
        vec3(0.28, 0.3, 0.34),
        v.storm,
      )
      const gain = mix(0.12, 1.35, v.amount).mul(mix(0.9, 1.15, v.storm))
      const lightTerm = clamp(pow(mu, 2).mul(v.storm.mul(0.85).oneMinus()).add(0.25), 0, 1)
      const cum = march(ro, rd, v.cumBase, v.cumBase.add(v.cumThick), 0, thresh)
      const al = march(ro, rd, v.altoBase, v.altoBase.add(v.altoThick), 1, thresh)
      const ci = march(ro, rd, v.cirBase, v.cirBase.add(v.cirThick), 2, thresh)
      const inDeck = step(v.cumBase, ro.y).mul(step(ro.y, v.cumBase.add(v.cumThick)))
      const cap = mix(mix(0.4, 0.72, v.amount), 0.88, inDeck)
      const a0 = clamp(cum.alpha.mul(gain), 0, cap)
      const a1 = clamp(al.alpha.mul(gain).mul(0.55), 0, 0.4).mul(a0.oneMinus())
      const a2 = clamp(ci.alpha.mul(gain).mul(0.4), 0, 0.28).mul(a0.oneMinus().sub(a1))
      const c0 = mix(shade, lit, lightTerm)
      const c1 = mix(vec3(0.58, 0.6, 0.64), vec3(0.86, 0.88, 0.9), lightTerm)
      const c2 = mix(vec3(0.78, 0.8, 0.84), vec3(1, 1, 1.02), lightTerm.mul(0.45).add(0.55))
      const total = a0.add(a1).add(a2)
      const color = c0.mul(a0).add(c1.mul(a1)).add(c2.mul(a2)).div(max(total, 0.001)).toVar()
      const alpha = total.mul(v.coverage).toVar()
      const under = step(ro.y, v.cumBase)
      alpha.mulAssign(mix(1, smoothstep(-0.02, 0.08, rd.y), under))
      const night = smoothstep(0, 0.4, v.day).oneMinus()
      color.assign(mix(color, color.mul(0.05), night))
      alpha.mulAssign(mix(1, 0.22, night))
      If(ro.y.lessThan(v.cumBase.sub(40)), () => {
        alpha.mulAssign(mix(smoothstep(0.997, 0.9995, mu).oneMinus(), 1, v.storm))
      })
      If(alpha.lessThan(0.02), () => {
        Discard()
      })
      const tHit = float(1e20).toVar()
      If(a0.greaterThan(0.02).and(cum.tHit.greaterThan(0)), () => {
        tHit.assign(cum.tHit)
      })
      If(a1.greaterThan(0.02).and(al.tHit.greaterThan(0)), () => {
        tHit.assign(min(tHit, al.tHit))
      })
      If(a2.greaterThan(0.02).and(ci.tHit.greaterThan(0)), () => {
        tHit.assign(min(tHit, ci.tHit))
      })
      If(tHit.greaterThan(1e19), () => {
        Discard()
      })
      const hit = cameraPosition.add(rd.mul(tHit))
      const viewZ = cameraViewMatrix.mul(vec4(hit, 1)).z
      const depth = logarithmicDepth
        ? viewZToLogarithmicDepth(viewZ, cameraNear, cameraFar)
        : viewZToPerspectiveDepth(viewZ, cameraNear, cameraFar)
      hitDepth.assign(min(depth, 0.9999))
      // Blend in display space, as WebGL does: read the frame under the deck, take it to display
      // values, mix, and hand the result back through the inverse output transform.
      const frameBelow = viewportSharedTexture(screenUV).rgb
      const shown = sRGBTransferOETF(acesFilmicToneMapping(frameBelow, toneMappingExposure))
      return vec4(decodeDisplay(mix(shown, color, alpha), tsl), 1)
    })()
    material.depthNode = hitDepth
    const opaque = () => {
      copyState(base, material)
      material.blending = NoBlending
      material.transparent = true
    }
    opaque()
    const sync = () => {
      opaque()
      for (const name of names) v[name].value = u[name].value
    }
    sync()
    return { material, sync }
  }
}
