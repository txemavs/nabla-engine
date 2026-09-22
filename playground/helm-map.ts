import { Matrix4, Quaternion, Vector3 } from 'three'
import { SceneGraph, type SceneDocument, type Entity, type Transform } from '../src/scene.js'
/** Local north-up chart: loaded vector roads only, no network or extra WebGL camera. */
export class HelmMap {
  private entities: Entity[] | null = null
  private roads: { points: Vector3[]; width: number }[] = []
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
      const graph = new SceneGraph(doc)
      this.roads = doc.entities
        .filter((e) => e.road)
        .flatMap((e) => {
          const t = graph.worldTransform(e.id)
          const m = new Matrix4().compose(
            new Vector3(...t.position),
            new Quaternion(...t.rotation),
            new Vector3(1, 1, 1),
          )
          return e.road!.paths.map((path) => ({
            points: path.map((p) => new Vector3(...p).applyMatrix4(m)),
            width: e.road!.width,
          }))
        })
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
    ctx.strokeStyle = '#549bd3'
    for (const road of this.roads) {
      if (
        !road.points.some(
          (p) => Math.abs(p.x - pose.position[0]) < 1600 && Math.abs(p.z - pose.position[2]) < 1000,
        )
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
    if (this.clean) return
    ctx.fillStyle = '#d5e6ef'
    ctx.font = '18px sans-serif'
    ctx.fillText('N ↑', 12, 25)
    ctx.fillText('200 m', 475, 212)
    ctx.fillRect(475, 218, 46, 2)
    if (!this.roads.length) ctx.fillText('Sin carreteras cargadas', 12, 215)
  }
}
