/**
 * Opt-in PC/VR/AR lobby and lightweight remote poses. Each participant explicitly
 * maps their local floor to the party frame; this is presence, not shared physics.
 */
import * as THREE from 'three'
import { localToGeo, type GeoPoint } from '../math/geo/sphere.js'
import { OnlineClient, type OnlinePlace, type OnlinePose } from './online.js'
import type { GameXR } from './xr.js'
import type { XRPanelAction } from './xr-panel-canvas.js'

export interface OnlinePresenceOptions {
  scene: THREE.Scene
  camera: THREE.Camera
  xr: GameXR
  origin?: THREE.Vector3
  geography?: GeoPoint
  room?: boolean
  url?: string
}
type Avatar = {
  root: THREE.Group
  head: THREE.Mesh
  left: THREE.Mesh
  right: THREE.Mesh
  updated: number
}

/** Browser UI and remote visuals; no extra animation loop or physics world. */
export class OnlinePresence {
  readonly client: OnlineClient
  private readonly panel = document.createElement('details')
  private readonly content = document.createElement('div')
  private readonly status = document.createElement('p')
  private readonly name = document.createElement('input')
  private readonly gameName = document.createElement('input')
  private readonly rows = document.createElement('div')
  private readonly avatars = new Map<string, Avatar>()
  private readonly anchor = new THREE.Vector3()
  private readonly heading = new THREE.Quaternion()
  private readonly inverse = new THREE.Quaternion()
  private readonly geometry = new THREE.BoxGeometry(0.22, 0.24, 0.25)
  private readonly handGeometry = new THREE.BoxGeometry(0.09, 0.09, 0.16)
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x61c9ff })
  private readonly noseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  private lastSend = -Infinity
  private lastFrame = 0
  private menuOpen = false
  private page = 0
  private installed = false
  private oldOptions?: () => XRPanelAction[]
  private oldStatus?: () => string
  private disposed = false

  constructor(private readonly options: OnlinePresenceOptions) {
    const endpoint = new URL(options.url ?? '/online/ws', location.href)
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : endpoint.protocol === 'http:' ? 'ws:' : endpoint.protocol
    this.client = new OnlineClient(endpoint.href)
    this.client.changed = () => this.refresh()
    this.client.joined = () => {
      this.recenter()
      this.clearAvatars()
    }
    this.panel.dataset.nablaOnline = ''
    this.panel.style.cssText = 'position:fixed;right:12px;top:12px;z-index:1200;max-width:min(360px,90vw);max-height:80vh;overflow:auto;background:#182532ee;color:#f1f7fc;padding:12px;border:1px solid #8dd1de;border-radius:8px;font:16px system-ui'
    const summary = document.createElement('summary')
    summary.textContent = 'Online · partidas'
    this.panel.append(summary, this.content)
    this.status.setAttribute('role', 'status')
    this.name.placeholder = 'Tu nombre'
    this.name.value = 'Jugador'
    this.name.maxLength = 40
    this.name.setAttribute('aria-label', 'Tu nombre')
    this.gameName.placeholder = 'Nombre de partida'
    this.gameName.value = 'Partida'
    this.gameName.maxLength = 80
    this.gameName.setAttribute('aria-label', 'Nombre de partida')
    this.content.append(this.status, this.name, this.gameName)
    this.button('Conectar / actualizar', () => this.client.connect(), this.content)
    this.button('Iniciar sesión online aquí', () => this.create(), this.content)
    this.button('Salir de la partida', () => this.client.leave(), this.content)
    const note = document.createElement('p')
    note.textContent = 'Presencia compartida. Sitúate y mira al frente al crear o unirte. La habitación, objetos y disparos siguen siendo locales.'
    this.content.append(note, this.rows)
    this.panel.addEventListener('toggle', () => {
      if (this.panel.open) this.client.connect()
    })
    this.panel.hidden = true
    document.body.append(this.panel)
    this.refresh()
  }

  private button(label: string, run: () => void, parent: HTMLElement): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.style.cssText = 'display:block;width:100%;margin:6px 0;padding:10px;background:#205b6c;color:inherit;border:1px solid #8dd1de;border-radius:6px'
    button.onclick = (event) => {
      event.stopPropagation()
      run()
    }
    parent.append(button)
  }

  private location(): OnlinePlace {
    const position = this.options.camera.getWorldPosition(new THREE.Vector3())
      .add(this.options.origin ?? new THREE.Vector3())
    const geography = this.options.geography
      ? localToGeo(this.options.geography, position.toArray()) : null
    return {
      kind: this.options.room ? 'room' : 'world',
      label: this.options.room ? 'Habitación AR' : geography
        ? geography.latitude.toFixed(5) + ', ' + geography.longitude.toFixed(5) : 'Escena local',
      origin: position.toArray(),
      geography,
    }
  }

  private create(): void {
    if (this.options.xr.active && !this.options.xr.visible) return
    this.client.create(this.gameName.value, this.name.value, this.location())
  }

  /** Set the participant's local floor/yaw mapping once, never on every tracking reset. */
  private recenter(): void {
    const camera = this.options.camera
    this.anchor.copy(camera.getWorldPosition(new THREE.Vector3()))
      .add(this.options.origin ?? new THREE.Vector3())
    if (this.options.room) this.anchor.y = 0
    else this.anchor.y -= 1.65
    const orientation = camera.getWorldQuaternion(new THREE.Quaternion())
    const yaw = new THREE.Euler().setFromQuaternion(orientation, 'YXZ').y
    this.heading.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    this.inverse.copy(this.heading).invert()
  }

  private sample(object: THREE.Object3D): OnlinePose {
    const position = object.getWorldPosition(new THREE.Vector3())
      .add(this.options.origin ?? new THREE.Vector3())
      .sub(this.anchor).applyQuaternion(this.inverse)
      .add(new THREE.Vector3(...this.client.spawn))
    const rotation = this.inverse.clone().multiply(object.getWorldQuaternion(new THREE.Quaternion())).normalize()
    return { position: position.toArray(), rotation: rotation.toArray() }
  }

  private refresh(): void {
    if (this.disposed) return
    this.status.textContent = this.client.status
    this.rows.replaceChildren()
    for (const game of this.client.games) {
      const label = game.name + ' · ' + game.count + ' · ' + game.place.label
      this.button(label + (game.id === this.client.game?.id ? ' · Dentro' : ' · Unirse'),
        () => this.client.join(game.id, this.name.value), this.rows)
    }
    if (!this.client.games.length) this.rows.textContent = 'No hay partidas activas.'
    if (!this.client.game) this.clearAvatars()
  }

  private menu(): XRPanelAction[] {
    if (!this.menuOpen) return [
      { label: 'Online · partidas', run: () => {
        this.menuOpen = true
        this.client.connect()
      } },
      ...(this.oldOptions?.() ?? []),
    ]
    const games = this.client.games
    const pages = Math.max(1, Math.ceil(games.length / 4))
    this.page = Math.min(this.page, pages - 1)
    return [
      { label: '‹ Opciones', run: () => { this.menuOpen = false } },
      { label: this.client.game ? 'Salir de ' + this.client.game.name : 'Iniciar sesión online aquí',
        run: () => this.client.game ? this.client.leave() : this.create() },
      { label: 'Conectar / actualizar · ' + games.length + ' partidas', run: () => this.client.connect() },
      ...games.slice(this.page * 4, this.page * 4 + 4).map((game) => ({
        label: game.name + ' · ' + game.count + ' · Unirse',
        run: () => this.client.join(game.id, this.name.value),
      })),
      ...(pages > 1 ? [{ label: 'Página ' + (this.page + 1) + '/' + pages + ' · Siguiente',
        run: () => { this.page = (this.page + 1) % pages } }] : []),
    ]
  }

  /** Called by the existing host frame after tracking/camera updates and before render. */
  update(time: number): void {
    if (this.disposed) return
    this.panel.hidden = false
    const screen = this.options.xr.calibrationScreen
    if (screen && !this.installed) {
      this.installed = true
      this.oldOptions = screen.optionsMenu
      this.oldStatus = screen.mainStatus
      screen.optionsMenu = () => this.menu()
      screen.mainStatus = () => this.menuOpen ? this.client.status : this.oldStatus?.() ?? ''
    }
    if (!this.client.game) return
    const visible = !document.hidden && (!this.options.xr.active || this.options.xr.visible)
    if (time - this.lastSend >= 50) {
      this.lastSend = time
      const hands = this.options.xr.active ? this.options.xr.grabHands : []
      this.client.track({
        tracking: visible,
        head: visible ? this.sample(this.options.camera) : null,
        left: visible && hands.find((h) => h.source?.handedness === 'left')
          ? this.sample(hands.find((h) => h.source?.handedness === 'left')!.grip) : null,
        right: visible && hands.find((h) => h.source?.handedness === 'right')
          ? this.sample(hands.find((h) => h.source?.handedness === 'right')!.grip) : null,
      })
    }
    const dt = Math.min(0.1, Math.max(0, (time - this.lastFrame) / 1000))
    this.lastFrame = time
    const active = new Set<string>()
    for (const member of this.client.members) {
      if (member.id === this.client.playerId) continue
      active.add(member.id)
      let avatar = this.avatars.get(member.id)
      if (!avatar) {
        const root = new THREE.Group()
        const head = new THREE.Mesh(this.geometry, this.material)
        const nose = new THREE.Mesh(this.handGeometry, this.noseMaterial)
        nose.position.z = -0.16
        head.add(nose)
        const left = new THREE.Mesh(this.handGeometry, this.material)
        const right = new THREE.Mesh(this.handGeometry, this.material)
        root.add(head, left, right)
        this.options.scene.add(root)
        avatar = { root, head, left, right, updated: time }
        this.avatars.set(member.id, avatar)
      }
      avatar.updated = this.client.snapshotTime
      avatar.root.visible = member.tracking && time - avatar.updated < 1000
      for (const key of ['head', 'left', 'right'] as const) {
        const pose = member[key], mesh = avatar[key]
        mesh.visible = !!pose
        if (!pose) continue
        const position = new THREE.Vector3(...pose.position)
          .sub(new THREE.Vector3(...this.client.spawn)).applyQuaternion(this.heading)
          .add(this.anchor).sub(this.options.origin ?? new THREE.Vector3())
        const rotation = this.heading.clone().multiply(new THREE.Quaternion(...pose.rotation))
        if (mesh.userData.onlineReady) {
          mesh.position.lerp(position, 1 - Math.exp(-18 * dt))
          mesh.quaternion.slerp(rotation, 1 - Math.exp(-18 * dt))
        } else {
          mesh.position.copy(position)
          mesh.quaternion.copy(rotation)
          mesh.userData.onlineReady = true
        }
      }
    }
    for (const [id, avatar] of this.avatars) if (!active.has(id)) {
      avatar.root.removeFromParent()
      this.avatars.delete(id)
    }
  }

  private clearAvatars(): void {
    for (const avatar of this.avatars.values()) avatar.root.removeFromParent()
    this.avatars.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.client.dispose()
    this.panel.remove()
    const screen = this.options.xr.calibrationScreen
    if (this.installed && screen) {
      screen.optionsMenu = this.oldOptions
      if (this.oldStatus) screen.mainStatus = this.oldStatus
    }
    this.clearAvatars()
    this.geometry.dispose()
    this.handGeometry.dispose()
    this.material.dispose()
    this.noseMaterial.dispose()
  }
}

export { OnlineClient } from './online.js'
export type { OnlineGame, OnlinePlace, OnlinePose, OnlineMember, OnlineTracking } from './online.js'
