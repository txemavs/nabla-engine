import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, BoxGeometry } from 'three'
import { stockVehiclePresentation } from '../../src/catalog/presentation/road-vehicles.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

describe('S3 cabin colour', () => {
  it('keeps crushed cabin materials above black and does not recolour chrome', () => {
    const entity = presetVehicle('car', 'car')
    const adapter = stockVehiclePresentation(entity)
    const model = new Group()
    const seat = new MeshStandardMaterial({ name: 'Asiento 1', color: '#030303' })
    const plastic = new MeshStandardMaterial({ name: 'Plastico 1', color: '#010101' })
    const grey = new MeshStandardMaterial({ name: 'Gris 2', color: '#050505' })
    const chrome = new MeshStandardMaterial({
      name: 'Cromo 1',
      color: '#888888',
      metalness: 1,
      roughness: 0.22,
    })
    const kept = new MeshStandardMaterial({ name: 'Gris 9', color: '#888888' })
    for (const material of [seat, plastic, grey, chrome, kept])
      model.add(new Mesh(new BoxGeometry(1, 1, 1), material))
    adapter!.mount(model, entity)
    adapter!.preparePart!(model, 'body')
    for (const material of [seat, plastic, grey]) {
      expect(Math.max(material.color.r, material.color.g, material.color.b)).toBeGreaterThan(0.1)
      expect(material.color.getHexString()).not.toBe('000000')
    }
    expect(kept.color.getHexString()).toBe('888888')
    expect(chrome.userData.nabla.reflective).toBe(true)
    // Whiter chrome base, not the cabin floor and not left at the dark authored grey.
    expect(chrome.color.r).toBeGreaterThan(0.9)
    expect(chrome.color.getHexString()).not.toBe('888888')
    for (const material of [seat, plastic, grey, chrome, kept]) material.dispose()
  })
})
