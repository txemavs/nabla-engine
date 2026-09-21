import { circuitEntities } from './circuit-plan.js'
import { createA3, createCarrier } from './presets.js'
import {
  createEntity,
  parseScene,
  rotationDegrees,
  type Entity,
  type SceneDocument,
  type Vec3Tuple,
} from './scene.js'

/** Content belongs to the host application. This scene is an optional example. */
export function createSampleScene(): SceneDocument {
  const entities: Entity[] = []
  function box(
    id: string,
    name: string,
    p: Vec3Tuple,
    size: Vec3Tuple,
    color: string,
    motion: Entity['motion'] = 'static',
  ): Entity {
    const e = { ...createEntity(id, 'box', p), name, size, color, motion }
    entities.push(e)
    return e
  }
  box('barrier', 'Barrera de pruebas', [-45, 0.65, -25], [5, 1.3, 0.6], '#d19756')
  box('crate-a', 'Caja móvil A', [-45, 0.6, -10], [1.2, 1.2, 1.2], '#c7a17b', 'dynamic')
  box('crate-b', 'Caja móvil B', [-45, 1.9, -10], [1.2, 1.2, 1.2], '#b18561', 'dynamic')
  const ramp = box('ramp', 'Rampa', [-45, 0.7, -34], [4.5, 0.4, 6], '#85948b')
  ramp.transform.rotation = rotationDegrees(12, 0, 0)
  entities.push(createA3('car-a'), createCarrier('carrier'))
  entities.push({
    ...createEntity('car-b', 'vehicle', [-4, 1.05, -1]),
    name: 'Brisa',
    color: '#91bfc0',
  })
  entities.push({ ...createEntity('spawn', 'spawn', [1.2, 0.06, 7]), name: 'Inicio del jugador' })
  const groups = [
    { ...createEntity('architecture', 'group'), name: 'Arquitectura' },
    { ...createEntity('streets', 'group'), name: 'Calles y aceras' },
    { ...createEntity('details', 'group'), name: 'Señalización y ventanas' },
    { ...createEntity('obstacles', 'group'), name: 'Zona de pruebas' },
  ]
  for (const e of entities) {
    if (e.kind !== 'box' || e.motion === 'dynamic') continue
    e.parentId = e.id.startsWith('building-')
      ? 'architecture'
      : e.id.startsWith('window-') || e.id.startsWith('line-')
        ? 'details'
        : e.id === 'barrier' || e.id === 'ramp'
          ? 'obstacles'
          : 'streets'
  }
  const roots = entities.filter((e) => e.parentId === null)
  return parseScene({
    version: 1,
    name: 'Distrito cero',
    geography: { latitude: 40.4166, longitude: -3.70384, altitude: 0, imagery: 'satellite' },
    entities: [
      ...roots,
      ...groups,
      ...entities.filter((e) => e.parentId !== null),
      ...circuitEntities(),
    ],
  })
}
