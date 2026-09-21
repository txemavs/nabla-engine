import { treeSprite } from '../src/vegetation.js'
import { rotationDegrees } from '../src/scene.js'
import { createA3 } from '../src/presets.js'
import { installCarrierPortals } from './carrier-portals.js'

/** Upgrade only recognised reference presets; preserve authored placements and custom mounts. */
export function upgradeReferenceScene(raw: unknown) {
  const doc = installCarrierPortals(raw)
  for (const e of doc.entities) {
    const mount = e.visual?.steering
    if (
      e.visual?.body.url === '/world/car.audi.a3.cabrio.glb' &&
      mount?.url === '/world/car.audi.a3.steering.glb'
    ) {
      const [x, y, z] = mount.transform.position
      if (
        mount.transform.rotation.every(
          (v, i) => Math.abs(v - rotationDegrees(25, 180, 0)[i]) < 1e-6,
        ) &&
        Math.abs(x + 0.356) < 1e-6 &&
        Math.abs(z + 0.311) < 1e-6 &&
        [0.274, 0.334].some((v) => Math.abs(y - v) < 1e-6)
      )
        mount.transform = createA3(e.id).visual!.steering!.transform
    }
    const tree = /^tree-(\d+)$/.exec(e.id)
    if (
      e.sprite &&
      /^\/sprites\/tree(?:-[1-5])?\.png$/.test(e.sprite.url) &&
      e.sprite.upright === undefined &&
      (tree || e.name === 'Árbol · capa lejana')
    ) {
      const i = tree ? Number(tree[1]) : Number(e.id.match(/-(\d+)$/)?.[1] ?? 0)
      e.sprite = { ...e.sprite, ...treeSprite(i) }
    }
    const target = /-target-(\d+)$/.exec(e.id)
    if (target && e.sprite?.target && e.name === 'Diana móvil') {
      const i = Number(target[1]),
        p = e.transform.position
      if (p[0] === -144 + i * 2 && p[1] === 0.4 && p[2] === -7 - (i % 3) * 5)
        p[2] = -11 - (i % 3) * 3
    }
  }
  return doc
}
