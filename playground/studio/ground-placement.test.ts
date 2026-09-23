import { expect, it } from 'vitest'
import { SceneEditor } from '../../src/editor.js'
import { parseScene } from '../../src/scene.js'
import { createPlanetScene } from './planet-scene.js'
import { settleGroundPlacement, recoverUnplacedDefaults } from './ground-placement.js'
const scene = () => createPlanetScene({ latitude: 40, longitude: -3, altitude: 0 }, 'High ground')
it('places each root and cursor on its own terrain and refines late heights', () => {
  const doc = scene()
  expect(settleGroundPlacement(doc, () => undefined)).toBe(false)
  settleGroundPlacement(doc, ([x]) => (x === 20 ? undefined : 600 + x))
  expect(doc.cursor).toEqual([0, 600, 0])
  expect(doc.entities.find((e) => e.id === 'car-a')!.transform.position[1]).toBe(600.62)
  expect(doc.entities.find((e) => e.id === 'carrier')!.transform.position[1]).toBe(2)
  const restored = parseScene(JSON.parse(JSON.stringify(doc)))
  settleGroundPlacement(restored, ([x]) => 602 + x)
  expect(restored.entities.find((e) => e.id === 'carrier')!.transform.position[1]).toBe(623.2)
  expect(restored.cursor).toEqual([0, 602, 0])
  expect(settleGroundPlacement(restored, ([x]) => 602 + x)).toBe(false)
})
it('explicit pose and cursor edits stop automatic placement', () => {
  const editor = new SceneEditor(scene())
  const car = editor.entity('car-a')
  editor.update(car.id, { transform: { ...car.transform, position: [0, 1000, 0] } })
  editor.setCursor([0, 900, 0])
  const doc = editor.document
  settleGroundPlacement(doc, () => 650)
  expect(doc.entities.find((e) => e.id === car.id)!.transform.position[1]).toBe(1000)
  expect(doc.cursor).toEqual([0, 900, 0])
  expect(doc.entities.find((e) => e.id === car.id)!.groundOffset).toBeUndefined()
})
it('recovers only the exact old unplaced defaults and preserves authored positions', () => {
  const old = scene()
  delete old.cursor
  delete old.cursorOnGround
  for (const e of old.entities) delete e.groundOffset
  const moved = structuredClone(old)
  moved.entities.find((e) => e.id === 'car-a')!.transform.position[1] = 42
  expect(recoverUnplacedDefaults(moved)).toBe(moved)
  const recovered = recoverUnplacedDefaults(old)
  expect(recovered).not.toBe(old)
  settleGroundPlacement(recovered, () => 700)
  expect(recovered.cursor).toEqual([0, 700, 0])
})
it('leaves attached children untouched and accepts terrain below sea level', () => {
  const doc = scene()
  doc.entities[1].parentId = 'carrier'
  settleGroundPlacement(doc, () => -40)
  expect(doc.entities[1].transform.position).toEqual([0, 1, 0])
  expect(doc.cursor).toEqual([0, -40, 0])
})
