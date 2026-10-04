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
  expect(poles[0].position[1]).toBe(14.5)
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
