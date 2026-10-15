import { expect, it } from 'vitest'
import * as T from 'three'
import { splitMapQuarters } from '../../src/runtime/ar/map-quarters.js'
it('cuts triangles exactly at quarter seams and preserves UVs and total area', async () => {
  const content = new T.Group(),
    geometry = new T.PlaneGeometry(20, 20)
  geometry.rotateX(-Math.PI / 2)
  geometry.deleteAttribute('normal')
  content.add(new T.Mesh(geometry, new T.MeshStandardMaterial()))
  await splitMapQuarters(content)
  expect(content.children).toHaveLength(4)
  let area = 0
  for (const group of content.children) {
    const [qx, qz] = group.userData.atlasQuarter
    const mesh = group.children[0] as T.Mesh,
      g = mesh.geometry,
      p = g.getAttribute('position'),
      uv = g.getAttribute('uv')
    for (let i = 0; i < p.count; i++) {
      expect(p.getX(i) * (qx ? 1 : -1)).toBeGreaterThanOrEqual(-1e-6)
      expect(p.getZ(i) * (qz ? 1 : -1)).toBeGreaterThanOrEqual(-1e-6)
      expect(uv.getX(i)).toBeCloseTo((p.getX(i) + 10) / 20)
    }
    for (let i = 0; i < g.index!.count; i += 3) {
      const a = new T.Vector3().fromBufferAttribute(p, g.index!.getX(i)),
        b = new T.Vector3().fromBufferAttribute(p, g.index!.getX(i + 1)),
        c = new T.Vector3().fromBufferAttribute(p, g.index!.getX(i + 2))
      area += b.sub(a).cross(c.sub(a)).length() / 2
    }
  }
  expect(area).toBeCloseTo(400)
})
it('selects at most four quarters while holding four complete cells', async () => {
  const { ARModel } = await import('../../src/runtime/ar/model.js')
  const model = new ARModel(new T.Scene()),
    cells = new Map<string, T.Group>(),
    pan = new T.Vector2()
  model.root = new T.Group()
  for (const x of [16223, 16224])
    for (const y of [11998, 11999]) {
      const cell = new T.Group()
      for (let i = 0; i < 4; i++) {
        const q = new T.Group()
        q.userData.atlasQuarter = [i % 2, Math.floor(i / 2)]
        cell.add(q)
      }
      cells.set(`${x}/${y}`, cell)
      model.root.add(cell)
    }
  Object.assign(model, { atlas: true, atlasBase: { x: 16223, y: 11998, prefix: '' }, cells, pan })
  await model.loadNeighborhood()
  expect(model.loadedCellCount).toBe(4)
  expect(model.visibleQuarterCount).toBe(4)
  pan.set(-500, -500)
  await model.loadNeighborhood()
  expect(model.visibleQuarterCount).toBe(4)
  model.dispose()
})
