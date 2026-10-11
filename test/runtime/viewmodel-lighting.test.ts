import { expect, it } from 'vitest'
import { Scene, Group, DirectionalLight, SpotLight, AmbientLight, Vector3 } from 'three'
import { ViewmodelLighting } from '../../src/runtime/viewmodel-lighting.js'

it('follows world lights and shadow maps without moving sources or accumulating targets', () => {
  const world = new Scene(),
    parent = new Group(),
    sun = new DirectionalLight(),
    spot = new SpotLight(),
    ambient = new AmbientLight()
  parent.position.set(12, 3, -8)
  parent.add(sun, spot)
  world.add(parent, ambient)
  sun.castShadow = true
  const bridge = new ViewmodelLighting()
  for (let i = 0; i < 20; i++) bridge.sync(world)
  expect(bridge.root.children.length).toBe(5)
  const copy = bridge.root.children.find((o) => o instanceof DirectionalLight) as DirectionalLight
  expect(copy.position.toArray()).toEqual(sun.getWorldPosition(new Vector3()).toArray())
  expect(copy.shadow).toBe(sun.shadow)
  expect(sun.parent).toBe(parent)
  sun.intensity = 0.08
  sun.color.set('#4488ff')
  bridge.sync(world)
  expect(copy.intensity).toBe(0.08)
  expect(copy.color.getHex()).toBe(sun.color.getHex())
  parent.visible = false
  bridge.sync(world)
  expect(bridge.root.children.length).toBe(1)
})
