import { expect, it } from 'vitest'
import { atmosphere, localTimeInput, skyTime, mapFogRange } from './sky.js'
import { celestialDirections, localFrame, MADRID } from './geography.js'
import { createSampleScene } from './sample.js'
import { SceneEditor } from './editor.js'
import { parseScene } from './scene.js'
it('uses a frozen UTC instant or the live clock and round-trips local input', () => {
  const at = '2026-09-21T12:30:00.000Z'
  expect(skyTime({ mode: 'fixed', at }, 0).toISOString()).toBe(at)
  expect(skyTime({ mode: 'live' }, 12345).getTime()).toBe(12345)
  expect(new Date(localTimeInput(new Date(at))).getTime()).toBe(new Date(at).getTime())
})
it('persists and undoes time selection without changing scene entities', () => {
  const editor = new SceneEditor(createSampleScene()),
    before = editor.document
  editor.load({ ...before, sky: { mode: 'fixed', at: '2026-09-21T00:00:00Z' } })
  expect(parseScene(JSON.parse(editor.serialize())).sky?.mode).toBe('fixed')
  expect(editor.document.entities).toEqual(before.entities)
  editor.undo()
  expect(editor.document.sky).toBeUndefined()
  expect(() => editor.load({ ...before, sky: { mode: 'fixed', at: 'invalid' } })).toThrow()
})
it('shares day/night atmosphere and removes ground haze continuously in space', () => {
  const frame = localFrame(MADRID).invert()
  const noon = celestialDirections(new Date('2026-09-21T12:00:00Z')).sun.applyQuaternion(frame)
  const midnight = celestialDirections(new Date('2026-09-21T00:00:00Z')).sun.applyQuaternion(frame)
  expect(atmosphere(100, noon.y).day).toBe(1)
  expect(atmosphere(100, midnight.y).day).toBe(0)
  expect(atmosphere(100, midnight.y).stars).toBe(1)
  expect(atmosphere(100000, noon.y).space).toBe(1)
  expect(atmosphere(100, noon.y).far).toBe(1200)
})

it('keeps loaded ground visible when hovering above the selected horizontal detail range', () => {
  expect(mapFogRange(0, 1000)).toEqual({ near: 750, far: 1000 })
  for (const height of [100, 650, 1200, 5000]) {
    const range = mapFogRange(height, 1000)
    // Ground directly below, and within the clear horizontal footprint, stays before fog.
    expect(Math.hypot(height, 500)).toBeLessThan(range.near)
    expect(Math.hypot(height, 1000)).toBeCloseTo(range.far)
    expect(range.far).toBeLessThan(Math.hypot(height, 1500))
  }
})
