import { XRUiClick } from './xr-ui-click.js'
import * as THREE from 'three'

export interface HUDPointer {
  source: XRInputSource
  tip: THREE.Vector3
  armed: boolean
  aim: THREE.Object3D
}
export interface HUDButton {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  holdMs?: number
  activate(): void
}
/** Head-following buttons share the panel's touch and unarmed trigger gestures. */
export class XRHUD {
  private readonly click = new XRUiClick()
  private readonly rays = new Map<XRInputSource, THREE.Line>()
  private readonly rayMaterial = new THREE.LineBasicMaterial({ color: '#9bdeff', depthTest: false })
  dispose(): void {
    this.click.dispose()
    for (const ray of this.rays.values()) {
      ray.removeFromParent()
      ray.geometry.dispose()
    }
    this.rays.clear()
    this.rayMaterial.dispose()
  }
  readonly captured = new Set<XRInputSource>()
  private holds = new Map<XRInputSource, { mesh: THREE.Object3D; start: number; fired: boolean }>()
  private contacts = new Map<XRInputSource, THREE.Object3D>()
  private triggers = new Set<XRInputSource>()
  private flashes = new Map<THREE.Object3D, number>()
  private ray = new THREE.Raycaster()
  update(buttons: HUDButton[], pointers: HUDPointer[], enabled: boolean, now: number): void {
    const contacts = new Map<XRInputSource, THREE.Object3D>(),
      triggers = new Set<XRInputSource>()
    this.captured.clear()
    const holding = new Set<XRInputSource>()
    for (const ray of this.rays.values()) ray.visible = false
    for (const { mesh } of buttons) {
      mesh.position.z = -0.55
      mesh.updateWorldMatrix(true, false)
      mesh.material.color.set('#ffffff')
    }
    for (const p of enabled ? pointers : []) {
      const pressed = !!p.source.gamepad?.buttons[0]?.pressed
      if (pressed) triggers.add(p.source)
      // The off hand operating a slide/magazine is not pointing at UI.
      const grip = p.source.gamepad?.buttons[1]
      if (!p.armed && (grip?.pressed || (grip?.value ?? 0) > 0.6)) continue
      for (const button of buttons) {
        const mesh = button.mesh
        if (!mesh.visible) continue
        const local = mesh.worldToLocal(p.tip.clone())
        const previous = this.contacts.get(p.source) === mesh
        const touch =
          Math.abs(local.x) < 0.05 &&
          Math.abs(local.y) < 0.05 &&
          local.z >= -0.035 &&
          local.z <= (previous ? 0.055 : 0.02)
        this.ray.set(
          p.aim.getWorldPosition(new THREE.Vector3()),
          new THREE.Vector3(0, 0, -1).applyQuaternion(
            p.aim.getWorldQuaternion(new THREE.Quaternion()),
          ),
        )
        const hit = !p.armed ? this.ray.intersectObject(mesh, false)[0] : undefined
        const aimed = !!hit
        if (!touch && !aimed) continue
        mesh.material.color.set('#9bdeff')
        if (hit && !touch && mesh.parent) {
          let ray = this.rays.get(p.source)
          if (!ray) {
            ray = new THREE.Line(new THREE.BufferGeometry(), this.rayMaterial)
            ray.renderOrder = 10002
            ray.frustumCulled = false
            this.rays.set(p.source, ray)
          }
          mesh.parent.add(ray)
          ray.geometry.setFromPoints([
            mesh.parent.worldToLocal(this.ray.ray.origin.clone()),
            mesh.parent.worldToLocal(hit.point.clone()),
          ])
          ray.visible = true
        }
        if (touch) contacts.set(p.source, mesh)
        if (touch || pressed) this.captured.add(p.source)
        let fire = (touch && !previous) || (!touch && pressed && !this.triggers.has(p.source))
        if (button.holdMs) {
          if (touch || pressed) {
            let hold = this.holds.get(p.source)
            if (fire) {
              hold = { mesh, start: now, fired: false }
              this.holds.set(p.source, hold)
            }
            holding.add(p.source)
            fire = !!hold && hold.mesh === mesh && !hold.fired && now - hold.start >= button.holdMs
            if (hold?.mesh === mesh) {
              mesh.material.color.set('#5fa5c9')
              if (fire) hold.fired = true
            }
          } else fire = false
        }
        if (fire) {
          this.flashes.set(mesh, now + 140)
          this.click.play()
          button.activate()
          const gamepad = p.source.gamepad as Gamepad & {
            hapticActuators?: { pulse(v: number, ms: number): Promise<boolean> }[]
          }
          void gamepad?.hapticActuators?.[0]?.pulse(0.25, 30).catch(() => {})
        }
        break
      }
    }
    for (const { mesh } of buttons)
      if ((this.flashes.get(mesh) ?? 0) > now) {
        mesh.position.z -= 0.008
        mesh.material.color.set('#5fa5c9')
      }
    for (const source of this.holds.keys()) if (!holding.has(source)) this.holds.delete(source)
    this.contacts = contacts
    this.triggers = triggers
  }
}
