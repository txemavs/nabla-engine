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
  return {
    rotate: rotate as (p: unknown, a: number, b: number, c: number, d: number) => V2,
    hash: (p: unknown): F => hash(p as V2),
    noise: (p: unknown): F => noise(p as V2),
    fbm: (p: unknown): F => fbm(p as V2),
  }
}
