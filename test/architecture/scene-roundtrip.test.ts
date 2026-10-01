import { expect, it } from 'vitest'
import { parseScene } from '../../src/scene/document.js'
import { SceneEditor } from '../../src/scene/history.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import {
  stockVehiclePresentation,
  s3Presentation,
} from '../../src/catalog/presentation/road-vehicles.js'

it('preserves current vehicle settings through edit, undo and JSON roundtrip', () => {
  const car = presetVehicle('car', 'current', [0, 1, 0])
  car.vehicle!.mirrorTilt = 5
  car.color = '#374859'
  const document = parseScene({
    version: 1,
    name: 'Current',
    entities: [createEntity('spawn', 'spawn', [0, 2, 4]), car],
  })
  const saved = document.entities[1]
  expect(stockVehiclePresentation(saved)).toBe(s3Presentation)
  expect(saved.vehicle!.mirrorTilt).toBe(5)
  expect(saved.visual!.presentation).toBe('nabla.s3')
  const editor = new SceneEditor(document)
  editor.update(car.id, { color: '#abcdef', vehicle: { ...saved.vehicle!, mirrorTilt: -2 } })
  expect(editor.entity(car.id).vehicle!.mirrorTilt).toBe(-2)
  editor.undo()
  expect(editor.entity(car.id).color).toBe('#374859')
  expect(editor.entity(car.id).vehicle!.mirrorTilt).toBe(5)
  editor.redo()
  const restored = parseScene(JSON.parse(JSON.stringify(editor.document)))
  expect(restored.entities[1].color).toBe('#abcdef')
  expect(restored.entities[1].vehicle!.mirrorTilt).toBe(-2)
  expect(() => editor.update(car.id, { vehicle: { ...saved.vehicle!, mirrorTilt: 13 } })).toThrow()
  expect(() => parseScene({ ...document, version: 2 })).toThrow()
})
