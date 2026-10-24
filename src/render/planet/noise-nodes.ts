import type { NodeKit } from '../webgpu-substitutes.js'

/**
 * TSL versions of the value-noise helpers in artistic-clouds.ts (`NOISE`): same constants, same
 * operation order. GLSL `mat2(a, b, c, d)` is column-major, so `m * p` is
 * `(a·x + c·y, b·x + d·y)`; `rotate` spells that out.
 */
export function noiseNodes(tsl: NodeKit['tsl']) {
  const t = tsl as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { Fn, vec2, float, fract, dot, floor, mix, Loop } = t
  // TSL's generics cannot follow these helpers; nodes are typed loosely inside this file.
  type V2 = any // eslint-disable-line @typescript-eslint/no-explicit-any
  type F = any // eslint-disable-line @typescript-eslint/no-explicit-any
  const rotate = (p: V2, a: number, b: number, c: number, d: number) =>
    vec2(p.x.mul(a).add(p.y.mul(c)), p.x.mul(b).add(p.y.mul(d)))
  const hash = Fn(([source]: [V2]) => {
    const p = fract(source.mul(vec2(123.34, 345.45))).toVar()
    p.addAssign(dot(p, p.add(34.345)))
    return fract(p.x.mul(p.y))
  })
  const noise = Fn(([p]: [V2]) => {
    const i = floor(p)
    const f0 = fract(p)
    const f = f0.mul(f0).mul(f0.mul(-2).add(3))
    return mix(
      mix(hash(i), hash(i.add(vec2(1, 0))), f.x),
      mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), f.x),
      f.y,
    )
  })
  const fbm = Fn(([source]: [V2]) => {
    const v = float(0).toVar()
    const a = float(0.5).toVar()
    const p = vec2(source).toVar()
    Loop(4, () => {
      v.addAssign(a.mul(noise(p) as F))
      p.assign(rotate(p, 0.8, 0.6, -0.6, 0.8).mul(2.02))
      a.mulAssign(0.5)
    })
    return v
  })
  const { smoothstep } = t
  // cumulus / alto / cirrus: the GLSL `NOISE` cloud kinds, same constants.
  const cumulus = (xz: V2, hours: F, thresh: F): F => {
    const p = xz.add(vec2(hours.mul(28800), hours.mul(9000))).mul(0.000026)
    const bank = noise(p)
    const lump = noise(rotate(p, 0.8, 0.6, -0.6, 0.8).mul(2.15).add(vec2(5.2, 1.3)))
    const n = bank.mul(0.82).add(lump.mul(0.18))
    const edge = smoothstep(thresh, thresh.add(0.13), n)
    const grain = noise(p.mul(4.2).add(vec2(9, 4)))
    return edge.mul(mix(0.8, 1, grain))
  }
  const alto = (xz: V2, hours: F, thresh: F): F => {
    const p0 = xz.add(vec2(hours.mul(28800), hours.mul(9000)))
    const p = rotate(p0, 0.9, 0.44, -0.44, 0.9).mul(vec2(0.000048, 0.000015))
    const sheet = noise(p)
      .mul(0.78)
      .add(noise(p.mul(2.05).add(vec2(2, 7))).mul(0.22))
    return smoothstep(thresh.sub(0.1), thresh.add(0.22), sheet)
  }
  const cirrus = (xz: V2, hours: F, thresh: F): F => {
    const p0 = xz.add(vec2(hours.mul(28800), hours.mul(9000)))
    const p = rotate(p0, 0.62, 0.78, -0.78, 0.62).mul(vec2(0.00012, 0.00001))
    const streak = noise(p)
      .mul(0.72)
      .add(noise(p.mul(vec2(2.6, 1.05)).add(vec2(8, 3))).mul(0.28))
    return smoothstep(thresh.add(0.05), thresh.add(0.46), streak)
  }
  return {
    cumulus: cumulus as (xz: unknown, hours: unknown, thresh: unknown) => F,
    alto: alto as (xz: unknown, hours: unknown, thresh: unknown) => F,
    cirrus: cirrus as (xz: unknown, hours: unknown, thresh: unknown) => F,
    rotate: rotate as (p: unknown, a: number, b: number, c: number, d: number) => V2,
    hash: (p: unknown): F => hash(p as V2),
    noise: (p: unknown): F => noise(p as V2),
    fbm: (p: unknown): F => fbm(p as V2),
  }
}
