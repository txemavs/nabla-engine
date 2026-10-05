import fs from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Box3, Group } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  landingGearMeshBounds,
  mountLandingGear,
} from '../../src/render/vehicle-presentation/landing-gear.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { trailerWheelContactY } from '../../src/simulation/landing-gear.js'

it('drops authored Stützbein meshes to the tyre plane when a free trailer deploys', async () => {
  const bytes = await fs.readFile('assets/library/trucks/white-truck/assets/trailer.chassis.glb')
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  const model = gltf.scene
  const authored = landingGearMeshBounds(model)
  expect(authored).not.toBeNull()
  const contact = trailerWheelContactY(presetVehicle('white-trailer', 't').vehicle!)
  const travel = contact - authored!.min.y
  expect(travel).toBeLessThan(-0.2)
  const gear = mountLandingGear(model, travel)
  expect(gear).toBeDefined()
  gear!.setDeployed(true, 0)
  gear!.update(0)
  const deployed = new Box3().setFromObject(gear!.root)
  expect(deployed.min.y).toBeCloseTo(contact, 2)
  gear!.setDeployed(false, 10_000)
  gear!.update(10_700)
  const retracted = new Box3().setFromObject(gear!.root)
  expect(retracted.min.y).toBeGreaterThan(deployed.min.y + 0.2)
  expect(model.getObjectByName('landing-gear')).toBeInstanceOf(Group)
})
