import * as THREE from 'three'
import { weaponPreset } from '@nabla/engine'
import { Sidearm } from '@nabla/engine/runtime'
import { pickQuestTarget, questHand, type QuestTarget } from './xr-pointer.js'

/** Quest input belongs to this host; the existing Sidearm still owns ammo and animation. */
export class QuestInteraction {
  readonly weapon: Sidearm
  readonly ready: Promise<void>
  private active = false
  private closed = false
  private message = 'Izquierda: seleccionar · Derecha: HK'
  private readonly slots: ReturnType<QuestInteraction['createSlot']>[] = []
  private readonly ray = new THREE.Raycaster(undefined, undefined, 0, 30)
  private readonly origin = new THREE.Vector3()
  private readonly rotation = new THREE.Quaternion()
  private readonly direction = new THREE.Vector3()
  private readonly marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ffb43b', toneMapped: false }),
  )
  private markerUntil = 0
  private readonly selection = new THREE.BoxHelper(new THREE.Object3D(), 0xffd15c)

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly rig: THREE.Group,
    private readonly targets: QuestTarget[],
    private readonly blockers: THREE.Object3D[],
    private readonly recenter: () => void,
  ) {
    this.weapon = new Sidearm(renderer.domElement, weaponPreset('hk-compact'))
    this.weapon.setSmokeEnabled(false)
    this.weapon.setSteadyHeld(true)
    this.ready = this.weapon.ready.then(() => {
      if (!this.closed && !this.weapon.model.getObjectByName('MuzzleSocket'))
        throw new Error('No se pudo cargar la HK de la biblioteca')
    })
    this.marker.visible = false
    this.selection.visible = false
    scene.add(this.marker, this.selection)
    for (let i = 0; i < 2; i++) this.slots.push(this.createSlot(i))
  }

  get summary(): string {
    return `${this.message} · HK ${this.weapon.ammo.total}`
  }

  setActive(active: boolean): void {
    this.active = active
    this.weapon.release()
    this.weapon.visible = false
    this.weapon.model.visible = false
    this.marker.visible = false
    this.selection.visible = false
    for (const slot of this.slots) {
      slot.ray.visible = false
      slot.dot.visible = false
      slot.hover.visible = false
      slot.body.visible = false
    }
  }

  private createSlot(index: number) {
    const aim = this.renderer.xr.getController(index)
    const grip = this.renderer.xr.getControllerGrip(index)
    const weaponMount = new THREE.Group()
    // Quest grip calibration: pitch the pistol down around its grip socket.
    weaponMount.rotation.x = -Math.PI / 2
    grip.add(weaponMount)
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.018, 0.07, 4, 8),
      new THREE.MeshStandardMaterial({ color: '#536b83', roughness: 0.7 }),
    )
    body.rotation.x = -Math.PI / 5
    grip.add(body)
    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: '#7cddff', transparent: true, opacity: 0.65 }),
    )
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#7cddff', toneMapped: false }),
    )
    const hover = new THREE.BoxHelper(new THREE.Object3D(), 0x7cddff)
    this.scene.add(ray, dot, hover)
    this.rig.add(aim, grip)
    ray.visible = dot.visible = hover.visible = body.visible = false
    const slot = {
      aim,
      grip,
      weaponMount,
      body,
      ray,
      dot,
      hover,
      source: null as XRInputSource | null,
      connect: (event: { data: XRInputSource }) => {
        slot.source = event.data
      },
      disconnect: () => {
        if (slot.source?.handedness === 'right') {
          this.weapon.release()
          this.weapon.visible = false
          this.weapon.model.visible = false
        }
        slot.source = null
        ray.visible = dot.visible = hover.visible = body.visible = false
      },
      select: () => {
        if (!this.usable(slot)) return
        const hand = questHand(slot.source!)
        const now = performance.now()
        if (hand === 'right') {
          this.weapon.visible = true
          this.weapon.update(now)
          this.weapon.syncTracked(weaponMount, now)
          const fired = this.weapon.pull(now)
          if (!fired.fired) {
            this.message = 'HK: botón lateral derecho para recargar'
            return
          }
          const hit = this.hit(slot)
          if (hit) {
            this.marker.position.copy(hit.point)
            this.markerUntil = now + 450
            this.message = `Impacto: ${hit.target.label}`
          } else this.message = 'Disparo'
          this.pulse(slot.source!, 0.45)
        } else if (hand === 'left') {
          const hit = this.hit(slot)
          this.selection.visible = !!hit
          if (hit) this.selection.setFromObject(hit.target.root)
          this.message = hit ? `Seleccionado: ${hit.target.label}` : 'Sin objeto seleccionado'
          this.pulse(slot.source!, 0.15)
        }
      },
      release: () => {
        if (slot.source?.handedness === 'right') this.weapon.release()
      },
      squeeze: () => {
        if (!this.usable(slot)) return
        if (questHand(slot.source!) === 'left') {
          this.recenter()
          this.message = 'Vista recentrada'
        } else {
          this.weapon.release()
          this.weapon.reload(performance.now())
          this.message = 'Recargando HK'
        }
      },
    }
    aim.addEventListener('connected', slot.connect)
    aim.addEventListener('disconnected', slot.disconnect)
    aim.addEventListener('selectstart', slot.select)
    aim.addEventListener('selectend', slot.release)
    aim.addEventListener('squeezestart', slot.squeeze)
    return slot
  }

  private usable(slot: (typeof this.slots)[number]): boolean {
    return (
      this.active &&
      (this.renderer.xr.getSession()?.visibilityState ?? 'visible') === 'visible' &&
      !this.closed &&
      !!slot.source &&
      !!questHand(slot.source) &&
      slot.aim.visible &&
      slot.grip.visible
    )
  }

  private pulse(source: XRInputSource, strength: number): void {
    void source.gamepad?.hapticActuators?.[0]?.pulse(strength, 35).catch(() => {})
  }

  private hit(slot: (typeof this.slots)[number]) {
    const muzzle =
      questHand(slot.source!) === 'right'
        ? this.weapon.model.getObjectByName('MuzzleSocket')
        : undefined
    const origin = muzzle ?? slot.aim
    origin.updateWorldMatrix(true, false)
    origin.getWorldPosition(this.origin)
    origin.getWorldQuaternion(this.rotation)
    this.direction.set(0, 0, -1).applyQuaternion(this.rotation).normalize()
    this.ray.set(this.origin, this.direction)
    return pickQuestTarget(this.ray, this.targets, this.blockers)
  }

  update(now: number): void {
    if (!this.active || this.closed) return
    this.weapon.update(now)
    let armed = false
    for (const slot of this.slots) {
      if (!this.usable(slot)) {
        slot.ray.visible = slot.dot.visible = slot.hover.visible = slot.body.visible = false
        continue
      }
      const right = questHand(slot.source!) === 'right'
      slot.body.visible = !right
      if (right) {
        armed = true
        this.weapon.visible = true
        this.weapon.syncTracked(slot.weaponMount, now)
      }
      const hit = this.hit(slot)
      slot.ray.visible = true
      slot.ray.position.copy(this.origin)
      slot.ray.quaternion.copy(this.rotation)
      slot.ray.scale.set(1, 1, hit?.distance ?? 8)
      slot.dot.visible = slot.hover.visible = !!hit
      if (hit) {
        slot.dot.position.copy(hit.point)
        slot.hover.setFromObject(hit.target.root)
      }
    }
    if (!armed) {
      this.weapon.release()
      this.weapon.visible = false
      this.weapon.model.visible = false
    }
    this.marker.visible = now < this.markerUntil
  }

  dispose(): void {
    this.closed = true
    this.setActive(false)
    for (const slot of this.slots) {
      slot.aim.removeEventListener('connected', slot.connect)
      slot.aim.removeEventListener('disconnected', slot.disconnect)
      slot.aim.removeEventListener('selectstart', slot.select)
      slot.aim.removeEventListener('selectend', slot.release)
      slot.aim.removeEventListener('squeezestart', slot.squeeze)
      for (const object of [slot.body, slot.ray, slot.dot, slot.hover]) {
        object.removeFromParent()
        object.geometry.dispose()
        object.material.dispose()
      }
      slot.weaponMount.removeFromParent()
      slot.aim.removeFromParent()
      slot.grip.removeFromParent()
    }
    this.weapon.dispose()
    for (const object of [this.marker, this.selection]) {
      object.removeFromParent()
      object.geometry.dispose()
      object.material.dispose()
    }
  }
}
