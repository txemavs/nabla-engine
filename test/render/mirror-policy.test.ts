import { expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import {
  CarMirrors,
  defaultMirrorCapture,
  mirrorPolicyForQuality,
  resolveMirrorCapture,
} from '../../src/render/entity/car-mirrors.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { stockVehiclePresentation } from '../../src/catalog/presentation/road-vehicles.js'

function taggedLens(side: string, x = 0): Mesh {
  const parent = new Group()
  const mesh = new Mesh(new PlaneGeometry(0.2, 0.12), new MeshStandardMaterial())
  mesh.userData.nabla = { mirror: side }
  mesh.position.set(x, 1, 0)
  parent.add(mesh)
  return mesh
}

function reflectorOf(lens: Mesh): Reflector {
  const reflection = lens.parent!.children.find((node) => node !== lens)
  expect(reflection).toBeInstanceOf(Reflector)
  return reflection as Reflector
}

it('doubles only the authored left capture on Alto and Ultra', () => {
  const left = {
    width: defaultMirrorCapture.width * 2,
    height: defaultMirrorCapture.height * 2,
    intervalMs: defaultMirrorCapture.intervalMs / 2,
  }
  for (const preset of ['high', 'ultra']) {
    const policy = mirrorPolicyForQuality(preset)
    expect(resolveMirrorCapture(policy, 'left')).toEqual(left)
    expect(resolveMirrorCapture(policy, 'right')).toEqual(defaultMirrorCapture)
    expect(resolveMirrorCapture(policy)).toEqual(defaultMirrorCapture)
  }
  for (const preset of ['minimal', 'mobile', 'low', 'balanced', 'custom', 'alta'])
    expect(mirrorPolicyForQuality(preset)).toEqual({})
})

it('sizes each Reflector from its authored side, leaving untagged lenses on the default', () => {
  const left = taggedLens('left', -1)
  const right = taggedLens('right', 1)
  const untagged = taggedLens('ignored', 0)
  untagged.userData = {}
  const mirrors = new CarMirrors(
    [left, right, untagged],
    undefined,
    0,
    mirrorPolicyForQuality('high'),
  )
  expect(reflectorOf(left).getRenderTarget().width).toBe(768)
  expect(reflectorOf(left).getRenderTarget().height).toBe(512)
  expect(reflectorOf(right).getRenderTarget().width).toBe(384)
  expect(reflectorOf(right).getRenderTarget().height).toBe(256)
  expect(reflectorOf(untagged).getRenderTarget().width).toBe(384)
  expect(reflectorOf(untagged).getRenderTarget().height).toBe(256)
  expect(
    () => new CarMirrors([taggedLens('left')], undefined, 0, { sides: { left: { width: 0 } } }),
  ).toThrow('Invalid mirror policy')
  mirrors.dispose()
})

it('the truck adapter applies the quality policy to GLB-tagged lenses', () => {
  const entity = presetVehicle('white-truck', 'truck')
  const model = new Group()
  const left = taggedLens('left', -1)
  const right = taggedLens('right', 1)
  model.add(left.parent!, right.parent!)
  const equipment = stockVehiclePresentation(entity)!.mount(
    model,
    entity,
    null,
    mirrorPolicyForQuality('high'),
  )
  expect(reflectorOf(left).getRenderTarget().width).toBe(768)
  expect(reflectorOf(right).getRenderTarget().width).toBe(384)
  equipment.mirrors!.dispose()
})
