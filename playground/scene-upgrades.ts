import { boxSolid } from '../src/solid.js'
import { circuitEntities } from '../src/circuit-plan.js'
import { treeSprite } from '../src/vegetation.js'
import { rotationDegrees } from '../src/scene.js'
import { createA3 } from '../src/presets.js'
import { installCarrierPortals } from './carrier-portals.js'

/** Upgrade only recognised reference presets; preserve authored placements and custom mounts. */
export function upgradeReferenceScene(raw: unknown, experimentalLargeScene = false) {
  const doc = installCarrierPortals(raw, experimentalLargeScene)
  // Recognised baseline buildings become independent topology components.
  // Preserve edited windows and anything with children.
  const baseline = circuitEntities()
  const removed = new Set<string>()
  for (const e of doc.entities) {
    const reference = baseline.find((b) => b.id === e.id && b.kind === 'solid')
    if (!reference || e.kind !== 'box' || e.motion !== 'static' || e.visual || e.surface) continue
    e.kind = 'solid'
    e.geometry = boxSolid(e.size)
    const i = e.id.slice('building-'.length)
    for (let floor = 0; floor < Math.floor(reference.size[1] / 2.6); floor++) {
      const w = doc.entities.find((n) => n.id === `window-${i}-${floor}`)
      if (
        w &&
        w.kind === 'box' &&
        w.name === 'Ventanal' &&
        w.parentId === 'details' &&
        w.motion === 'none' &&
        w.color === '#bbd9d5' &&
        JSON.stringify(w.size) === JSON.stringify([reference.size[0] * 0.78, 1, 0.04]) &&
        JSON.stringify(w.transform.position) ===
          JSON.stringify([
            reference.transform.position[0],
            1.8 + floor * 2.6,
            reference.transform.position[2] + reference.size[2] / 2 + 0.02,
          ]) &&
        w.transform.rotation.every((v, j) => v === [0, 0, 0, 1][j]) &&
        !w.visual &&
        !w.surface &&
        !doc.entities.some((n) => n.parentId === w.id)
      )
        removed.add(w.id)
    }
  }
  doc.entities = doc.entities.filter((e) => !removed.has(e.id))
  for (const e of doc.entities) {
    if (e.visual?.body.url === '/world/car.audi.a3.cabrio.glb' && e.vehicle) {
      const current = createA3(e.id).vehicle!
      if (
        Math.abs(e.vehicle.suspensionRest - 0.16) < 1e-6 &&
        Math.abs(e.vehicle.wheelRadius - current.wheelRadius) < 1e-6 &&
        e.vehicle.hubs.every((hub, i) =>
          hub.every((v, j) => Math.abs(v - (current.hubs[i][j] + (j === 1 ? 0.05 : 0))) < 1e-6),
        )
      ) {
        e.vehicle.hubs = current.hubs
        e.vehicle.suspensionRest = current.suspensionRest
      }
    }
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
