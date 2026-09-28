import * as THREE from 'three'
import type { Simulation, Vec3Tuple } from '../src/index.js'

export interface WheelDebugData {
  wheelIndex: number
  physicsHit: Vec3Tuple | null
  visualHit: Vec3Tuple | null
  delta: number | null
  isInContact: boolean
}

/**
 * Debug overlay to compare physics ground height vs visual terrain height.
 * Hypothesis: wheel sinking occurs when y_physics < y_visual due to streaming latency.
 */
export class WheelDebugOverlay {
  readonly root = new THREE.Group()
  private readonly markers = new Map<
    number,
    { physics: THREE.Mesh; visual: THREE.Mesh; line: THREE.Line }
  >()
  private readonly raycaster = new THREE.Raycaster()
  private enabled = false
  private terrainMeshes: THREE.Object3D[] = []
  private lastData: WheelDebugData[] = []
  private spikeThreshold = 0.05
  private spikeLog: { time: number; wheelIndex: number; delta: number }[] = []

  constructor() {
    this.root.name = 'WheelDebugOverlay'
    this.root.renderOrder = 1000
    for (let i = 0; i < 4; i++) {
      const physicsMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0x00ff00,
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        }),
      )
      physicsMarker.name = `PhysicsHit_${i}`
      physicsMarker.renderOrder = 1001

      const visualMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0xff6600,
          depthTest: false,
          transparent: true,
          opacity: 0.85,
        }),
      )
      visualMarker.name = `VisualHit_${i}`
      visualMarker.renderOrder = 1001

      const lineGeometry = new THREE.BufferGeometry()
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
      const line = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({
          color: 0xffff00,
          depthTest: false,
          transparent: true,
          opacity: 0.7,
        }),
      )
      line.name = `DeltaLine_${i}`
      line.renderOrder = 1000

      this.root.add(physicsMarker, visualMarker, line)
      this.markers.set(i, { physics: physicsMarker, visual: visualMarker, line })
    }
    this.root.visible = false
  }

  toggle(): boolean {
    this.enabled = !this.enabled
    this.root.visible = this.enabled
    if (!this.enabled) {
      this.lastData = []
    }
    return this.enabled
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  get data(): WheelDebugData[] {
    return this.lastData
  }

  get recentSpikes(): typeof this.spikeLog {
    const cutoff = performance.now() - 5000
    this.spikeLog = this.spikeLog.filter((s) => s.time > cutoff)
    return this.spikeLog
  }

  setTerrainMeshes(meshes: THREE.Object3D[]): void {
    this.terrainMeshes = meshes
  }

  update(sim: Simulation | null, vehicleId: string | null, renderOrigin: THREE.Vector3): void {
    if (!this.enabled || !sim || !vehicleId) {
      for (const { physics, visual, line } of this.markers.values()) {
        physics.visible = false
        visual.visible = false
        line.visible = false
      }
      this.lastData = []
      return
    }

    const wheelContacts = sim.wheelContactInfo(vehicleId)
    const wheelTransforms = sim.wheelTransforms(vehicleId, false)
    this.lastData = []
    this.spikeLog = this.spikeLog.filter((s) => s.time > performance.now() - 5000)
    for (const mesh of this.terrainMeshes) mesh.updateWorldMatrix(true, true)

    for (let i = 0; i < Math.min(wheelContacts.length, 4); i++) {
      const contact = wheelContacts[i]
      const transform = wheelTransforms[i]
      const marker = this.markers.get(i)
      if (!marker) continue

      const data: WheelDebugData = {
        wheelIndex: i,
        physicsHit: contact.contactPoint,
        visualHit: null,
        delta: null,
        isInContact: contact.isInContact,
      }

      if (contact.contactPoint) {
        const physicsWorld = new THREE.Vector3(...contact.contactPoint)
        marker.physics.position.copy(physicsWorld).sub(renderOrigin)
        marker.physics.visible = true

        const wheelCenter = new THREE.Vector3(...transform.position)
        this.raycaster.set(
          new THREE.Vector3(wheelCenter.x, wheelCenter.y + 2, wheelCenter.z).sub(renderOrigin),
          new THREE.Vector3(0, -1, 0),
        )
        this.raycaster.far = 10

        const intersects = this.raycaster.intersectObjects(this.terrainMeshes, true)
        const visualHit = intersects.find(
          (h) => h.object.visible && h.object.type !== 'Line' && h.object.type !== 'Points',
        )

        if (visualHit) {
          const visualWorld = visualHit.point.clone().add(renderOrigin)
          data.visualHit = visualWorld.toArray() as Vec3Tuple
          data.delta = visualWorld.y - physicsWorld.y

          marker.visual.position.copy(visualHit.point)
          marker.visual.visible = true

          const linePositions = marker.line.geometry.attributes.position as THREE.BufferAttribute
          linePositions.setXYZ(
            0,
            marker.physics.position.x,
            marker.physics.position.y,
            marker.physics.position.z,
          )
          linePositions.setXYZ(
            1,
            marker.visual.position.x,
            marker.visual.position.y,
            marker.visual.position.z,
          )
          linePositions.needsUpdate = true
          marker.line.geometry.computeBoundingSphere()
          marker.line.visible = true

          const lineMat = marker.line.material as THREE.LineBasicMaterial
          if (Math.abs(data.delta) > this.spikeThreshold) {
            lineMat.color.setHex(0xff0000)
            this.spikeLog.push({
              time: performance.now(),
              wheelIndex: i,
              delta: data.delta,
            })
          } else if (Math.abs(data.delta) > 0.02) {
            lineMat.color.setHex(0xffff00)
          } else {
            lineMat.color.setHex(0x00ff00)
          }
        } else {
          marker.visual.visible = false
          marker.line.visible = false
        }
      } else {
        marker.physics.visible = false
        marker.visual.visible = false
        marker.line.visible = false
      }

      this.lastData.push(data)
    }
  }

  formatHud(): string {
    if (!this.enabled || this.lastData.length === 0) return ''
    const lines: string[] = ['WHEEL DEBUG (F9 off)']
    const labels = ['FL', 'FR', 'RL', 'RR']
    for (const d of this.lastData) {
      const label = labels[d.wheelIndex] ?? `W${d.wheelIndex}`
      if (d.delta !== null) {
        const sign = d.delta >= 0 ? '+' : ''
        const color = Math.abs(d.delta) > this.spikeThreshold ? '!' : ''
        lines.push(`${label}: ${color}${sign}${(d.delta * 100).toFixed(1)}cm`)
      } else {
        lines.push(`${label}: --`)
      }
    }
    const spikes = this.recentSpikes
    if (spikes.length > 0) {
      lines.push(`Spikes (5s): ${spikes.length}`)
    }
    return lines.join('\n')
  }

  dispose(): void {
    for (const { physics, visual, line } of this.markers.values()) {
      physics.geometry.dispose()
      ;(physics.material as THREE.Material).dispose()
      visual.geometry.dispose()
      ;(visual.material as THREE.Material).dispose()
      line.geometry.dispose()
      ;(line.material as THREE.Material).dispose()
    }
    this.markers.clear()
    this.root.clear()
  }
}
