import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { bowModels, buildBowModel, defaultBow, arcoBow } from '../../src/runtime/bow-model.js'
import { parseHeldWeaponPreset } from '../../src/catalog/weapons/held-library.js'

const mesh = (name: string) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  m.name = name
  return m
}

describe('shared bow model', () => {
  it('cuts the string out of a clone and leaves the asset alone', () => {
    const asset = new THREE.Group().add(mesh('bow'), mesh('arrow'))
    const source = asset.getObjectByName('bow') as THREE.Mesh
    const before = source.geometry.getIndex()!.count
    const { bow, arrow } = buildBowModel(asset, {
      ...arcoBow.model,
      bowNode: 'bow',
      arrowNode: 'arrow',
      stringTriangles: [0, 1],
    })
    expect(bow.geometry.getIndex()!.count).toBe(before - 6)
    expect(source.geometry.getIndex()!.count).toBe(before)
    expect(bow.geometry).not.toBe(source.geometry)
    expect(arrow.userData.bowModelPart).toBe(true)
  })
  it('names the bows for held presets (arco by default)', () => {
    expect(Object.keys(bowModels)).toEqual(['arco'])
    expect(defaultBow).toBe(bowModels.arco)
    const preset = parseHeldWeaponPreset({
      id: 'arco',
      name: 'Bow',
      kind: 'bow',
      slot: 4,
      bowModel: 'arco',
      view: { position: [0, 0, 0], rotation: [0, 0, 0] },
    })
    expect(preset.bowModel).toBe('arco')
    expect(() =>
      parseHeldWeaponPreset({
        id: 'k',
        name: 'K',
        kind: 'prop',
        slot: 3,
        bowModel: 'arco',
        model: '/m.glb',
        view: { position: [0, 0, 0], rotation: [0, 0, 0] },
      }),
    ).toThrow()
  })
})
