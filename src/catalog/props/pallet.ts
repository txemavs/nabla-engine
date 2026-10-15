import { createEntity, type Entity, type Vec3Tuple } from '../../entity/schema.js'
import palletSpec from '../../../assets/library/cars/forklift-rc/pallet.specs.json' with { type: 'json' }
/** Ordinary dynamic Engine boxes: separate planks preserve the fork entry openings. */
export function palletEntity(id: string, withBox = false, position: Vec3Tuple = [0, 0, 0]): Entity {
  const entity = createEntity(id, 'box', position)
  entity.name = withBox ? 'Palé con caja de 1 m' : 'Palé'
  entity.motion = 'dynamic'
  entity.mass = withBox ? 80 : 25
  entity.size = [1.16, withBox ? 1.145 : 0.145, 1.2]
  entity.colliders = structuredClone(palletSpec.colliders) as NonNullable<Entity['colliders']>
  if (withBox)
    entity.colliders.push({
      size: [0.95, 1, 0.95],
      transform: { position: [0, 0.645, 0], rotation: [0, 0, 0, 1] },
    })
  entity.visual = {
    body: {
      url: withBox
        ? '/library/cars/forklift-rc/pallet-box.glb'
        : '/library/cars/forklift-rc/pallet.glb',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    },
  }
  return entity
}
