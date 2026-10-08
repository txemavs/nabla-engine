/**
 * Lean clearance of a motorcycle GLB at its static ride height: for every vertex outside the
 * wheels, the roll angle about the tyre contact line at which it reaches the ground, and the
 * first part to touch on each side. Reports the knife-edge angle (roll about the wheel-plane
 * contact line, as the game's rigid chassis and raycast wheels lean) and, for reference, the
 * angle with a round tyre crown (roll about the crown centre, crown radius = half the tyre width).
 *
 * Prints `pegLean` for the preset (`vehicle.twoWheeled.pegLean`): the knife-edge lean per side and
 * the touching point in chassis space (GLB point plus the preset's body visual offset).
 *
 *   node scripts/vfr800-lean-clearance.mjs [path.glb] [preset.json]
 */
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const path = process.argv[2] ?? 'assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb'
const presetPath = process.argv[3] ?? 'assets/library/motorcycles/vfr800fi-1999/vfr800.json'
const offset = JSON.parse(readFileSync(presetPath, 'utf8')).visual.body.transform.position
const bytes = readFileSync(path)
const root = (
  await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
).scene
root.updateMatrixWorld(true)
const part = (o) => {
  for (let n = o; n; n = n.parent) if (n.userData?.nabla?.part) return n.userData.nabla.part
  return '?'
}
const inside = (o, name) => {
  for (let n = o; n; n = n.parent) if (n.userData?.nabla?.part === name) return true
  return false
}
// Ground: the lowest tyre point (the model sits on its tyres at static ride height).
const tyre = (name) => {
  const node = root.getObjectByName(name)
  return new THREE.Box3().setFromObject(node)
}
const front = tyre('Tire_Front'),
  rear = tyre('Tire_Rear')
const ground = Math.min(front.min.y, rear.min.y)
const crown = {
  front: (front.max.x - front.min.x) / 2,
  rear: (rear.max.x - rear.min.x) / 2,
  frontZ: (front.min.z + front.max.z) / 2,
  rearZ: (rear.min.z + rear.max.z) / 2,
}
const crownAt = (z) => {
  const t = THREE.MathUtils.clamp((z - crown.frontZ) / (crown.rearZ - crown.frontZ), 0, 1)
  return crown.front + (crown.rear - crown.front) * t
}
const best = { left: [], right: [] }
const v = new THREE.Vector3()
root.traverse((o) => {
  if (!o.isMesh || inside(o, 'Wheel_Front') || inside(o, 'Wheel_Rear')) return
  const materials = [o.material].flat()
  if (materials.some((m) => m.transparent && m.opacity < 0.5)) return
  const p = o.geometry.attributes.position
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)
    const h = v.y - ground,
      x = Math.abs(v.x)
    if (x < 0.03) continue
    const knife = Math.atan2(h, x)
    // Round crown of radius r: the bike rolls about the crown centre (height r); a point touches
    // when r + (h - r) cos θ - x sin θ = 0.
    const r = crownAt(v.z)
    const a = h - r,
      R = Math.hypot(a, x)
    const crowned = R > r ? Math.atan2(a, x) + Math.acos(-r / R) - Math.PI / 2 : NaN
    const side = v.x < 0 ? 'left' : 'right'
    best[side].push({ knife, crowned, part: part(o), material: o.material.name, at: v.toArray() })
  }
})
const deg = (r) => ((r * 180) / Math.PI).toFixed(1)
const report = {}
for (const side of ['left', 'right']) {
  const list = best[side].sort((a, b) => a.knife - b.knife)
  const first = list[0]
  const crowned = [...list].sort((a, b) => a.crowned - b.crowned)[0]
  report[side] = {
    knifeEdgeDeg: Number(deg(first.knife)),
    knifeEdgeRad: Number(first.knife.toFixed(4)),
    part: first.part,
    material: first.material,
    point: first.at.map((n) => Number(n.toFixed(4))),
    crownedTyreDeg: Number(deg(crowned.crowned)),
    crownedPart: `${crowned.part} / ${crowned.material}`,
  }
  // The next distinct regions (by material), to see what scrapes after the first.
  const seen = new Set()
  report[side].next = list
    .filter((e) => !seen.has(e.material) && seen.add(e.material))
    .slice(0, 5)
    .map((e) => `${e.material} ${deg(e.knife)}° at ${e.at.map((n) => n.toFixed(3)).join(',')}`)
}
console.log(JSON.stringify({ ground, crown, ...report }, null, 2))
const chassis = (point) => point.map((n, i) => Number((n + offset[i]).toFixed(4)))
console.log(
  'pegLean: ' +
    JSON.stringify({
      left: { lean: report.left.knifeEdgeRad, point: chassis(report.left.point) },
      right: { lean: report.right.knifeEdgeRad, point: chassis(report.right.point) },
    }),
)
