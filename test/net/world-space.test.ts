import { expect, it } from 'vitest'
import { WorldSpace } from '../../src/net/world-space.js'
import { geoToLocal } from '../../src/math/geo/sphere.js'
import { Quaternion } from 'three'

it('maps poses, linear/angular velocities and weapon rays between distinct planetary origins', () => {
  const originA = { latitude: 43.2, longitude: -2.9, altitude: 120 }
  const originB = { latitude: 43.2001, longitude: -2.9002, altitude: 125 }
  const a = new WorldSpace({ space: 'planet', content: 'earth', origin: originA })
  const b = new WorldSpace({ space: 'planet', content: 'earth', origin: originB })
  const p = b.point(a.point([0, 0, 0]), true)
  const expected = geoToLocal(originB, originA)
  p.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 7))
  const state = {
    position: [10, 2, 20] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
    velocity: [2, 3, 4] as [number, number, number],
    angularVelocity: [0.1, 0.2, 0.3] as [number, number, number],
  }
  const roundtrip = a.state(b.state(b.state(a.state(state), true)), true)
  for (const key of ['position', 'velocity', 'angularVelocity'] as const)
    roundtrip[key].forEach((v, i) => expect(v).toBeCloseTo(state[key][i], 7))
  expect(
    new Quaternion(...roundtrip.rotation).angleTo(new Quaternion(...state.rotation)),
  ).toBeLessThan(1e-7)
  const fire = { o: [1, 2, 3], d: [0, 0, -1], w: 2, k: 1 }
  const received = b.event('fire', a.event('fire', fire), true)
  expect(received.o).not.toEqual(fire.o)
  const back = a.event('fire', b.event('fire', received), true)
  ;(back.o as number[]).forEach((v, i) => expect(v).toBeCloseTo(fire.o[i], 7))
  ;(back.d as number[]).forEach((v, i) => expect(v).toBeCloseTo(fire.d[i], 7))
})

it('preserves avatar heading/aim and body-relative held pose across a planetary roundtrip', () => {
  const space = new WorldSpace({
    space: 'planet',
    content: 'earth',
    origin: { latitude: 89.9, longitude: 179.999, altitude: 0 },
  })
  const avatar = {
    p: [1, 2, 3] as [number, number, number],
    y: 1.2,
    a: 1,
    s: 2,
    v: [0.7, 0.3] as [number, number],
    g: [1, 0, 0, 0, 0, 0, 1] as [number, number, number, number, number, number, number],
  }
  const back = space.avatar(space.avatar(avatar), true)
  expect(back.y).toBeCloseTo(avatar.y, 8)
  expect(back.v?.[0]).toBeCloseTo(0.7, 8)
  expect(back.v?.[1]).toBeCloseTo(0.3, 8)
  expect(back.g).toEqual(avatar.g)
  back.p.forEach((v, i) => expect(v).toBeCloseTo(avatar.p[i], 7))
})

it('uses identity coordinates for an ordinary GLB and rejects invalid origins', () => {
  const space = new WorldSpace({ space: 'local', content: 'glb-hash' })
  expect(space.point([-25, 3, 500])).toEqual([-25, 3, 500])
  expect(space.rotation([0, 0, 0, 1])).toEqual([0, 0, 0, 1])
  expect(
    () =>
      new WorldSpace({
        space: 'planet',
        content: 'earth',
        origin: { latitude: NaN, longitude: 0, altitude: 0 },
      }),
  ).toThrow()
})
