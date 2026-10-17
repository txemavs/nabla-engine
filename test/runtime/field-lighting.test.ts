import { expect, it } from 'vitest'
import { Vector3, SpotLight } from 'three'
import { FieldLighting } from '../../src/runtime/field-lighting.js'
import { FieldLights, type FieldLightMark } from '../../src/render/entity/field-lights.js'
const origin = { latitude: 0, longitude: 0, altitude: 0 },
  tile = { z: 15, x: 16384, y: 16384 }
const mark: FieldLightMark = { lat: 0, lon: 0, tags: { highway: 'street_lamp' } }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const update = (lights: FieldLights, height: number | undefined = 0) =>
  lights.update(origin, [0, 0, 0], true, 0, () => height, [tile])
it('keeps light settings independent and hands grounded lamp posts to physics', async () => {
  const a = new FieldLighting({ source: async () => [mark], look: { level: 20 } })
  const b = new FieldLighting({ source: async () => [], layers: { navigation: false } })
  a.lights.look.reach = 10
  expect(b.lights.look.reach).toBe(28)
  let poles: ReturnType<FieldLights['poles']> = []
  const tick = (height: number | undefined) =>
    a.update({
      origin,
      eye: new Vector3(),
      renderOrigin: new Vector3(100, 0, 0),
      night: true,
      time: 0,
      heightAt: () => height,
      tiles: [tile],
      simulation: {
        setPoles: (value) => {
          poles = value
        },
      },
    })
  tick(undefined)
  await settle()
  tick(undefined)
  tick(12)
  expect(poles[0].position[1]).toBeCloseTo(13.8)
  expect(poles[0].half[1]).toBeCloseTo(1.8)
  expect(a.lights.root.position.x).toBe(-100)
  expect(a.lights.root.children.some((x) => x instanceof SpotLight && x.intensity > 0)).toBe(true)
  b.update({
    origin,
    eye: new Vector3(),
    renderOrigin: new Vector3(),
    night: true,
    time: 0,
    heightAt: () => 0,
    tiles: [tile],
  })
  expect(b.lights.layers.navigation).toBe(false)
  a.dispose()
  b.dispose()
})
it('does not mount late source results after disposal', async () => {
  let complete!: (marks: FieldLightMark[]) => void, signal!: AbortSignal
  const lights = new FieldLights({
    source: (_tile, s) => {
      signal = s
      return new Promise((resolve) => {
        complete = resolve
      })
    },
  })
  update(lights)
  await settle()
  lights.dispose()
  expect(signal.aborted).toBe(true)
  complete([mark])
  await settle()
  expect(lights.poles()).toEqual([])
  expect(lights.root.children).toHaveLength(0)
})
it('rejects stale data from the previous geographic origin', async () => {
  const pending: { resolve: (marks: FieldLightMark[]) => void; signal: AbortSignal }[] = []
  const lights = new FieldLights({
    source: (_tile, signal) => new Promise((resolve) => pending.push({ resolve, signal })),
  })
  update(lights)
  await settle()
  lights.update({ ...origin, longitude: 1 }, [0, 0, 0], true, 0, () => 0, [tile])
  await settle()
  expect(pending[0].signal.aborted).toBe(true)
  pending[0].resolve([mark])
  await settle()
  expect(lights.poles()).toEqual([])
  pending[1].resolve([{ ...mark, lon: 1 }])
  await settle()
  expect(lights.poles()).toHaveLength(1)
  expect(lights.poles()[0].position[0]).toBeCloseTo(0)
  lights.dispose()
})
it('drops unloaded tile geometry and cancels pending requests', async () => {
  let cancelled!: AbortSignal
  const lights = new FieldLights({
    source: async (t, signal) => {
      if (t.x === 16384) return [mark]
      cancelled = signal
      return new Promise(() => {})
    },
  })
  update(lights)
  await settle()
  expect(lights.poles()).toHaveLength(1)
  lights.update(origin, [0, 0, 0], true, 0, () => 0, [{ ...tile, x: 16385 }])
  await settle()
  expect(lights.poles()).toEqual([])
  lights.reset()
  expect(cancelled.aborted).toBe(true)
  lights.dispose()
})

it('reuses the nearest eight beams, supports zero and disables them in daylight', async () => {
  const lights = new FieldLights({
    source: async () => Array.from({ length: 14 }, (_, i) => ({ ...mark, lon: i * 0.00001 })),
  })
  const active = () =>
    lights.root.children.filter((n): n is SpotLight => n instanceof SpotLight && n.intensity > 0)
  try {
    update(lights)
    await settle()
    update(lights)
    expect(lights.beamLimit).toBe(8)
    expect(active()).toHaveLength(8)
    const first = active()
      .map((b) => b.position.x)
      .sort((a, b) => a - b)
    expect(first[7]).toBeLessThan(13)
    lights.update(origin, [14, 0, 0], true, 0, () => 0, [tile])
    expect(Math.min(...active().map((b) => b.position.x))).toBeGreaterThan(1)
    lights.setShadows(true)
    expect(active().every((b) => b.castShadow)).toBe(true)
    lights.update(origin, [0, 0, 0], false, 0, () => 0, [tile])
    const reserved = lights.root.children.filter((b): b is SpotLight => b instanceof SpotLight)
    expect(reserved.every((b) => b.castShadow && !b.shadow.autoUpdate)).toBe(true)
    update(lights)
    lights.setBeamLimit(4)
    expect(lights.root.children.filter((b) => b instanceof SpotLight)).toHaveLength(4)
    lights.setShadows(false)
    expect(active().every((b) => !b.castShadow)).toBe(true)
    lights.update(origin, [0, 0, 0], false, 0, () => 0, [tile])
    expect(active()).toHaveLength(0)
    lights.setBeamLimit(0)
    update(lights)
    expect(lights.beamLimit).toBe(0)
    expect(active()).toHaveLength(0)
  } finally {
    lights.dispose()
  }
})

it('keeps the exact nearest selection across turns, day/night and budget changes', async () => {
  const marks = Array.from({ length: 40 }, (_, i) => ({ ...mark, lon: ((i * 17) % 40) * 0.00001 }))
  const lights = new FieldLights({ maxBeams: 4, source: async () => marks })
  try {
    update(lights)
    await settle()
    update(lights)
    const positions = lights.poles().map((p) => p.position[0])
    for (const limit of [4, 12, 2, 0, 6]) {
      lights.setBeamLimit(limit)
      for (const x of [0, 30, 5, 42, -10]) {
        lights.update(origin, [x, 0, 0], false, 0, () => 0, [tile])
        lights.update(origin, [x, 0, 0], true, 0, () => 0, [tile])
        const actual = lights.root.children
          .filter((n): n is SpotLight => n instanceof SpotLight && n.intensity > 0)
          .map((n) => n.position.x)
          .sort((a, b) => a - b)
        const expected = [...positions]
          .sort((a, b) => Math.abs(a - x) - Math.abs(b - x))
          .slice(0, limit)
          .sort((a, b) => a - b)
        expect(actual).toEqual(expected)
      }
    }
  } finally {
    lights.dispose()
  }
})
