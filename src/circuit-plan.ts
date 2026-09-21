import { treeSprite } from './vegetation.js'
import { createEntity, type Entity, type SceneDocument, type Vec3Tuple } from './scene.js'

// Surveyed rectangles in the original 1024 × 682 Agency JPEG, not inferred at runtime.
export const CIRCUIT_PLOTS = [
  [453, 156, 499, 206],
  [514, 160, 553, 205],
  [389, 178, 409, 206],
  [599, 176, 626, 206],
  [374, 254, 406, 304],
  [338, 272, 363, 305],
  [456, 279, 494, 305],
  [519, 280, 551, 309],
  [598, 278, 640, 309],
  [660, 264, 678, 310],
  [351, 355, 406, 404],
  [456, 356, 500, 404],
  [524, 357, 550, 404],
  [599, 354, 644, 385],
  [599, 398, 660, 409],
  [456, 452, 518, 490],
  [530, 453, 551, 490],
  [600, 454, 619, 470],
] as const
export const CIRCUIT_SCALE = 189.737 / 1024
export function circuitPoint(u: number, v: number, height = 0): Vec3Tuple {
  return [4 + (u - 430) * CIRCUIT_SCALE, height, (v - 330) * (126.368 / 682)]
}
export function circuitEntities(): Entity[] {
  const result: Entity[] = []
  const ground = createEntity('ground', 'box', circuitPoint(512, 341, -0.3))
  ground.name = 'Suelo Agency · circuito'
  ground.size = [189.737, 0.6, 126.368]
  ground.color = '#ffffff'
  ground.surface = { url: '/geography/agency-ground.jpg' }
  ground.parentId = 'streets'
  result.push(ground)
  const palette = ['#66818a', '#83948d', '#b69c80', '#7c879b']
  CIRCUIT_PLOTS.forEach(([x0, y0, x1, y1], i) => {
    const h = 6 + (i % 3) * 3,
      w = (x1 - x0) * CIRCUIT_SCALE,
      d = ((y1 - y0) * 126.368) / 682
    const e = createEntity(
      `building-${i}`,
      'box',
      circuitPoint((x0 + x1) / 2, (y0 + y1) / 2, h / 2),
    )
    e.name = `Edificio ${i + 1}`
    e.size = [w, h, d]
    e.color = palette[i % 4]
    e.parentId = 'architecture'
    result.push(e)
    for (let floor = 0; floor < Math.floor(h / 2.6); floor++) {
      const window = createEntity(`window-${i}-${floor}`, 'box', [
        e.transform.position[0],
        1.8 + floor * 2.6,
        e.transform.position[2] + d / 2 + 0.02,
      ])
      window.name = 'Ventanal'
      window.motion = 'none'
      window.parentId = 'details'
      window.size = [w * 0.78, 1, 0.04]
      window.color = '#bbd9d5'
      result.push(window)
    }
  })
  // The JPEG supplies asphalt, curved roads, lane markings and sidewalks; keep them unobscured.
  for (const [i, [u, v]] of [
    [180, 180],
    [220, 430],
    [800, 160],
    [820, 490],
    [300, 545],
    [690, 565],
    [275, 245],
    [750, 410],
    [200, 290],
    [230, 510],
    [280, 510],
    [275, 175],
    [330, 130],
    [670, 140],
    [760, 220],
    [820, 280],
    [850, 450],
    [790, 525],
    [585, 562],
    [400, 565],
  ].entries()) {
    const tree = createEntity(`tree-${i}`, 'group', circuitPoint(u, v))
    tree.name = `Árbol ${i + 1}`
    tree.parentId = 'architecture'
    const height = 5.5 + (i % 4) * 1.2
    tree.size = [height, height, 0.1]
    tree.sprite = treeSprite(i)
    result.push(tree)
  }
  return result
}
/** Replaces only the baseline plan-owned entities, keeping vehicles, portals and user additions. */
export function alignCircuitPlan(document: SceneDocument): SceneDocument {
  const doc = structuredClone(document)
  const owned = (id: string) =>
    ['ground', 'road', 'west-path', 'east-path'].includes(id) ||
    /^(building-\d+|window-\d+-\d+|line--?\d+|tree-\d+)$/.test(id)
  for (const e of doc.entities)
    if (['crate-a', 'crate-b', 'barrier', 'ramp'].includes(e.id) && e.transform.position[0] === -4)
      e.transform.position[0] = -45
  doc.entities = doc.entities.filter((e) => !owned(e.id))
  for (const id of ['streets', 'architecture', 'details'])
    if (!doc.entities.some((e) => e.id === id)) doc.entities.push(createEntity(id, 'group'))
  doc.entities.push(...circuitEntities())
  return doc
}
