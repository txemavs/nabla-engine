import * as THREE from 'three'
import { HoopScoring, type HoopBallSample } from '../simulation/sports/hoop.js'
import { XRStationPlacement, type StationHand } from './xr-station-placement.js'
import { interfaceTheme as theme } from '../ui/theme.js'
import type { XRDisposalTest } from './xr-disposal-portal.js'

/** Reusable hoop over the host's balls and room World. Placement is the same
 * mechanism as the driving stations; collisions are ordinary shared room meshes.
 */
export class XRHoop {
  readonly body = new THREE.Group()
  readonly root = new THREE.Group()
  readonly scoring = new HoopScoring()
  readonly pinButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.018, 16),
    new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.7 }),
  )
  private readonly pinBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.07, 0.035),
    new THREE.MeshStandardMaterial({ color: 0x555e66 }),
  )
  private readonly placement: XRStationPlacement
  private readonly board = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.65, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xe1e5e8, roughness: 0.85 }),
  )
  private readonly rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.012, 6, 40),
    new THREE.MeshStandardMaterial({ color: 0xe77627, roughness: 0.6 }),
  )
  private readonly bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.035, 0.055),
    new THREE.MeshStandardMaterial({ color: 0xe77627 }),
  )
  private readonly matrix = new THREE.Matrix4()
  private readonly lastPosition = new THREE.Vector3()
  private camera?: THREE.Camera
  private texture?: THREE.CanvasTexture
  private canvas?: HTMLCanvasElement
  private lastScore = ''
  disposalTest?: XRDisposalTest
  constructor(scene: THREE.Scene, { scoreboard = true }: { scoreboard?: boolean } = {}) {
    this.body.name = 'Engine movable basketball hoop'
    this.body.add(this.root)
    scene.add(this.body)
    this.root.visible = false
    this.board.position.set(0, 0.22, 0)
    this.rim.rotation.x = Math.PI / 2
    this.rim.position.set(0, 0, 0.28)
    this.bracket.position.set(0, 0, 0.035)
    for (const mesh of [this.board, this.rim, this.bracket]) {
      mesh.userData.xrSupplementalCollision = true
      this.root.add(mesh)
    }
    this.pinBase.position.set(0, -0.46, 0.02)
    this.pinButton.position.set(0, -0.46, 0.05)
    this.pinButton.rotation.x = Math.PI / 2
    this.pinButton.name = 'Agarrar canasta / fijar posición'
    this.root.add(this.pinBase, this.pinButton)
    this.placement = new XRStationPlacement(this.body, this.pinButton, this.pinBase)
    // A visual open net; no hidden disk or net collider blocking the balls.
    const points: THREE.Vector3[] = []
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        b = ((i + 1) * Math.PI) / 8
      points.push(
        new THREE.Vector3(Math.cos(a) * 0.225, 0, 0.28 + Math.sin(a) * 0.225),
        new THREE.Vector3(Math.cos(a) * 0.14, -0.34, 0.28 + Math.sin(a) * 0.14),
      )
      for (const [r, y] of [
        [0.225, 0],
        [0.14, -0.34],
      ])
        points.push(
          new THREE.Vector3(Math.cos(a) * r, y, 0.28 + Math.sin(a) * r),
          new THREE.Vector3(Math.cos(b) * r, y, 0.28 + Math.sin(b) * r),
        )
    }
    this.root.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xd2d8dd }),
      ),
    )
    if (scoreboard) {
      this.canvas = document.createElement('canvas')
      this.canvas.width = 512
      this.canvas.height = 128
      this.texture = new THREE.CanvasTexture(this.canvas)
      this.texture.colorSpace = THREE.SRGBColorSpace
      const display = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, 0.2),
        new THREE.MeshBasicMaterial({
          map: this.texture,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      )
      display.position.set(0, 0.68, 0.02)
      this.root.add(display)
    }
    this.drawScore()
  }
  get score(): number {
    return this.scoring.score
  }
  get fixed(): boolean {
    return this.placement.fixed
  }
  get collisionSurfaces(): THREE.Mesh[] {
    return this.root.visible ? [this.board, this.rim, this.bracket] : []
  }
  owns(grip: THREE.Group): boolean {
    return this.root.visible && this.placement.owns(grip)
  }
  place(camera: THREE.Camera): void {
    this.camera = camera
    this.root.visible = true
    this.root.position.set(0, -0.2, -0.65)
    this.placement.reset()
    this.placement.fixed = false
    this.placement.resetAnchor()
    this.scoring.resetTracking()
    this.update([], 0)
    this.lastPosition.copy(this.root.getWorldPosition(new THREE.Vector3()))
  }
  update(hands: readonly StationHand[], dt: number): void {
    if (!this.root.visible || !this.camera) return
    this.placement.follow(this.camera, dt)
    this.root.updateWorldMatrix(true, true)
    this.placement.update(hands, dt)
    this.root.updateWorldMatrix(true, true)
    const position = this.root.getWorldPosition(new THREE.Vector3())
    if (this.disposalTest?.(this.lastPosition, position, 0.1)) {
      this.clear()
      return
    }
    this.lastPosition.copy(position)
    this.drawScore()
  }
  sampleBalls(samples: readonly HoopBallSample[]): void {
    if (!this.root.visible || !this.fixed || this.placement.grab.hands.length) {
      this.scoring.resetTracking()
      return
    }
    this.root.updateWorldMatrix(true, true)
    if (!this.matrix.equals(this.root.matrixWorld)) {
      this.scoring.resetTracking()
      this.matrix.copy(this.root.matrixWorld)
    }
    const inverse = this.root.matrixWorld.clone().invert()
    const balls = samples.map((ball) => {
      const point = new THREE.Vector3().copy(ball.position).applyMatrix4(inverse)
      point.z -= 0.28
      return { ...ball, position: point }
    })
    if (this.scoring.sample(balls)) this.drawScore()
  }
  resetScore(): void {
    this.scoring.reset()
    this.drawScore()
  }
  private drawScore(): void {
    const key = `${this.score}:${this.fixed}`
    if (!this.canvas || key === this.lastScore) return
    this.lastScore = key
    const context = this.canvas.getContext('2d')!
    context.fillStyle = theme.surface
    context.fillRect(0, 0, 512, 128)
    context.fillStyle = theme.ink
    context.textAlign = 'center'
    context.font = 'bold 48px monospace'
    context.fillText(`ENCESTES ${String(this.score).padStart(2, '0')}`, 256, 60)
    context.font = '20px sans-serif'
    context.fillText(
      this.fixed ? 'CANASTA FIJADA' : 'AGARRA ABAJO · BOTÓN NEGRO PARA FIJAR',
      256,
      103,
    )
    this.texture!.needsUpdate = true
  }
  clear(): void {
    this.root.visible = false
    this.placement.reset()
    this.scoring.reset()
    this.lastScore = ''
  }
  dispose(): void {
    this.clear()
    this.placement.dispose()
    this.texture?.dispose()
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        for (const material of [object.material].flat()) material.dispose()
      }
    })
    this.body.removeFromParent()
  }
}
