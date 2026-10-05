import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three'
import { stockVehiclePresentation } from '../../src/catalog/presentation/road-vehicles.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

function paintedModel() {
  const model = new Group()
  const paint = new MeshStandardMaterial({ name: 'White paint', color: '#eeeeee' })
  const paintCopy = new MeshStandardMaterial({ name: 'White paint.001', color: '#eeeeee' })
  const chrome = new MeshStandardMaterial({ name: 'Chassis', color: '#17191e' })
  model.add(new Mesh(new BoxGeometry(1, 1, 1), paint))
  model.add(new Mesh(new BoxGeometry(1, 1, 1), paintCopy))
  model.add(new Mesh(new BoxGeometry(1, 1, 1), chrome))
  return { model, paint, paintCopy, chrome }
}

describe('nabla.truck body color', () => {
  it('paints White paint materials on truck and trailer, leaving chassis alone', () => {
    for (const id of ['white-truck', 'white-trailer'] as const) {
      const entity = presetVehicle(id, id)
      entity.color = '#2157a5'
      expect(entity.visual?.presentation).toBe('nabla.truck')
      const adapter = stockVehiclePresentation(entity)
      expect(adapter?.paint).toBeTypeOf('function')
      const { model, paint, paintCopy, chrome } = paintedModel()
      adapter!.mount(model, entity)
      expect(paint.color.getHexString()).toBe('2157a5')
      expect(paintCopy.color.getHexString()).toBe('2157a5')
      expect(chrome.color.getHexString()).toBe('17191e')
      adapter!.paint!(model, '#b91929')
      expect(paint.color.getHexString()).toBe('b91929')
      expect(paintCopy.color.getHexString()).toBe('b91929')
      expect(chrome.color.getHexString()).toBe('17191e')
      paint.dispose()
      paintCopy.dispose()
      chrome.dispose()
    }
  })
})
