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
  box(
    'ground',
    'Suelo Agency · JPEG',
    [0.093, -0.3, 2.13],
    [189.737, 0.6, 126.368],
    '#ffffff',
  ).surface = { url: '/geography/agency-ground.jpg' }
  box('road', 'Pista', [0, 0.015, 0], [16, 0.03, 85], '#303d43', 'none')
  for (let z = -37; z <= 37; z += 6)
    box('line-' + z, 'Marca vial', [0, 0.04, z], [0.14, 0.02, 2.7], '#d9cfa9', 'none')
  box('west-path', 'Acera oeste', [-10, 0.12, 0], [3, 0.24, 85], '#9ca6a1')
  box('east-path', 'Acera este', [10, 0.12, 0], [3, 0.24, 85], '#9ca6a1')
  const colors = ['#66818a', '#83948d', '#b69c80', '#7c879b']
  for (let i = 0; i < 8; i++) {
    const x = i % 2 === 0 ? -19 : 19,
      z = Math.floor(i / 2) * 19 - 29,
      h = 6 + (i % 3) * 3
    box(
      'building-' + i,
      'Edificio ' + (i + 1),
      [x, h / 2, z],
      [12, h, 13],
      colors[i % colors.length],
    )
    for (let floor = 0; floor < Math.floor(h / 2.6); floor++) {
      box(
        'window-' + i + '-' + floor,
        'Ventanal',
        [x + (x < 0 ? 6.02 : -6.02), 1.8 + floor * 2.6, z],
        [0.04, 1, 10],
        '#bbd9d5',
        'none',
      )
    }
  }
  box('barrier', 'Barrera de pruebas', [-4, 0.65, -25], [5, 1.3, 0.6], '#d19756')
  box('crate-a', 'Caja móvil A', [-4, 0.6, -10], [1.2, 1.2, 1.2], '#c7a17b', 'dynamic')
  box('crate-b', 'Caja móvil B', [-4, 1.9, -10], [1.2, 1.2, 1.2], '#b18561', 'dynamic')
  const ramp = box('ramp', 'Rampa', [-4, 0.7, -34], [4.5, 0.4, 6], '#85948b')
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
    entities: [...roots, ...groups, ...entities.filter((e) => e.parentId !== null)],
  })
}
