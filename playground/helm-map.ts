import { nearestLocality } from './navigation-places.js'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { SceneGraph, type SceneDocument, type Entity, type Transform } from '../src/scene.js'
type ChartTile = { bitmap: ImageBitmap; bounds: [number, number, number, number]; matrix: Matrix4 }
let planetCharts: () => ChartTile[] = () => []
export function setPlanetCharts(provider: () => ChartTile[]) {
  planetCharts = provider
}
type ChartRoad = {
  points: Vector3[]
  width: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}
const chartCache = new WeakMap<Entity[], ChartRoad[]>()
/** All cockpit screens share one immutable projection per scene revision. */
export function chartRoads(doc: SceneDocument): ChartRoad[] {
  const cached = chartCache.get(doc.entities)
  if (cached) return cached
  const graph = SceneGraph.fromValidated(doc)
  const roads = doc.entities
    .filter((e) => e.road)
    .flatMap((e) => {
      const t = graph.worldTransform(e.id)
      const m = new Matrix4().compose(
        new Vector3(...t.position),
        new Quaternion(...t.rotation),
        new Vector3(1, 1, 1),
      )
      return e.road!.paths.map((path) => {
        const points = path.map((p) => new Vector3(...p).applyMatrix4(m))
        let minX = Infinity,
          maxX = -Infinity,
          minZ = Infinity,
          maxZ = -Infinity
        for (const p of points) {
          minX = Math.min(minX, p.x)
          maxX = Math.max(maxX, p.x)
          minZ = Math.min(minZ, p.z)
          maxZ = Math.max(maxZ, p.z)
        }
        return { points, width: e.road!.width, minX, maxX, minZ, maxZ }
      })
    })
  chartCache.set(doc.entities, roads)
  return roads
}
/** Local north-up chart: loaded vector roads only, no network or extra WebGL camera. */
export class HelmMap {
  private entities: Entity[] | null = null
  private roads: ChartRoad[] = []
  private next = 0
  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly clean = false,
    private readonly zoom = 1,
  ) {
    canvas.width = 580
    canvas.height = clean ? 384 : 230
  }
  update(doc: SceneDocument, pose: Transform, now: number): void {
    if (now < this.next) return
    this.next = now + 250
    if (doc.entities !== this.entities) {
      this.entities = doc.entities
      this.roads = chartRoads(doc)
    }
    const ctx = this.canvas.getContext('2d')!
    const scale = 0.23 * this.zoom,
      cx = 290,
      cy = this.canvas.height / 2
    ctx.fillStyle = '#07172c'
    ctx.fillRect(0, 0, 580, this.canvas.height)
    ctx.strokeStyle = '#123253'
    ctx.lineWidth = 1
    for (let x = 0; x < 580; x += 46) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, this.canvas.height)
      ctx.stroke()
    }
    for (let y = 0; y < this.canvas.height; y += 46) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(580, y)
      ctx.stroke()
    }
    const tiles = planetCharts()
    for (const tile of tiles) {
      const [x, z, maxX, maxZ] = tile.bounds
      const e = tile.matrix.elements
      ctx.save()
      ctx.translate(cx - pose.position[0] * scale, cy - pose.position[2] * scale)
      ctx.transform(
        e[0] * scale,
        e[2] * scale,
        e[8] * scale,
        e[10] * scale,
        e[12] * scale,
        e[14] * scale,
      )
      ctx.drawImage(tile.bitmap, x, z, maxX - x, maxZ - z)
      ctx.restore()
    }
    ctx.strokeStyle = '#549bd3'
    for (const road of this.roads) {
      const pad = road.width / 2
      if (
        road.maxX + pad < pose.position[0] - cx / scale ||
        road.minX - pad > pose.position[0] + cx / scale ||
        road.maxZ + pad < pose.position[2] - cy / scale ||
        road.minZ - pad > pose.position[2] + cy / scale
      )
        continue
      ctx.lineWidth = Math.max(1, road.width * scale)
      ctx.beginPath()
      road.points.forEach((p, i) => {
        const x = cx + (p.x - pose.position[0]) * scale,
          y = cy + (p.z - pose.position[2]) * scale
        if (i) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      })
      ctx.stroke()
    }
    const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...pose.rotation))
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.atan2(forward.x, -forward.z))
    ctx.fillStyle = '#63d8ff'
    ctx.beginPath()
    ctx.moveTo(0, -15)
    ctx.lineTo(10, 11)
    ctx.lineTo(0, 6)
    ctx.lineTo(-10, 11)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#07172c'
    ctx.fillRect(0, 0, 580, 36)
    ctx.fillStyle = '#d5e6ef'
    ctx.font = '20px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(nearestLocality(pose.position), 290, 25, 560)
    ctx.textAlign = 'start'
    if (this.clean) return
    ctx.fillStyle = '#d5e6ef'
    ctx.font = '18px sans-serif'
    ctx.fillText('N ↑', 12, 58)
    ctx.fillText('200 m', 475, 212)
    ctx.fillRect(475, 218, 46, 2)
    if (!this.roads.length && !tiles.length) ctx.fillText('Sin carreteras cargadas', 12, 215)
  }
}
