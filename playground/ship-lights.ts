import * as THREE from 'three'

export type ShipSwitch = 'nav' | 'beacon' | 'spots' | 'cabin' | 'shutters'

/** Exterior lights follow the flying-craft set. The desk only holds the switches. */
export class ShipLights {
  private navOn = false
  private beaconOn = false
  private spotsOn = false
  private cabinOn = true
  private shuttersOn = false
  private shutterStamp = 0
  private readonly position: THREE.Mesh[] = []
  private readonly shutters: THREE.Object3D[] = []
  private beacon: THREE.Mesh
  private readonly bars: THREE.MeshBasicMaterial[] = []
  private readonly spots: THREE.SpotLight[] = []
  private readonly strips: THREE.MeshStandardMaterial[] = []
  private readonly cabinLights: THREE.PointLight[] = []
  private readonly switches: THREE.Mesh[] = []
  constructor(room: THREE.Group, hull: THREE.Object3D) {
    const lens = (color: string, position: [number, number, number]) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 12, 8),
        new THREE.MeshBasicMaterial({ color: '#141414', toneMapped: false }),
      )
      mesh.name = 'Exterior nav'
      mesh.position.set(...position)
      mesh.userData.navColor = color
      hull.add(mesh)
      return mesh
    }
    this.position = [
      lens('#ff2430', [-2.62, 1.35, -2.2]),
      lens('#3dff6e', [2.62, 1.35, -2.2]),
      lens('#f7fbff', [0, 1.7, 5.4]),
    ]
    this.beacon = lens('#ff3b30', [0, 2.32, -0.6])
    const beams: [number, number][] = [
      [-1.53, -22],
      [0, 0],
      [1.53, 22],
    ]
    for (const [x, aim] of beams) {
      const lens = new THREE.MeshBasicMaterial({ color: '#141414', toneMapped: false })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.07), lens)
      lamp.name = 'Headlight'
      lamp.position.set(x, -0.86, -5.16)
      hull.add(lamp)
      this.bars.push(lens)
      const spot = new THREE.SpotLight('#fff6e4', 0, 1200, 0.09, 0.22, 1)
      spot.position.set(x, -0.86, -5.2)
      spot.target.position.set(aim, -12, -280)
      spot.castShadow = false
      hull.add(spot, spot.target)
      this.spots.push(spot)
    }
    room.traverse((object) => {
      if (object.name === 'Cabin strip' && object instanceof THREE.Mesh)
        this.strips.push(object.material as THREE.MeshStandardMaterial)
    })
    for (const x of [-1.15, 1.15]) {
      const light = new THREE.PointLight('#d5e6ff', 0, 2.6, 2)
      light.position.set(x, 1.62, 0)
      light.castShadow = false
      room.add(light)
      this.cabinLights.push(light)
    }
    const labels: [ShipSwitch, string][] = [
      ['nav', 'NAV'],
      ['beacon', 'FLASH'],
      ['spots', 'FOCOS'],
      ['cabin', 'CABINA'],
    ]
    labels.forEach(([kind, label], index) => {
      const button = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.028, 0.09),
        new THREE.MeshStandardMaterial({
          color: '#14202a',
          emissive: '#8fd0ff',
          emissiveIntensity: 0,
          roughness: 0.45,
          map: labelTexture(label),
        }),
      )
      button.name = 'Ship switch'
      button.userData.shipSwitch = kind
      button.position.set(-1.18, 0.034, -3.5 + index * 0.1)
      room.add(button)
      this.switches.push(button)
    })
    const blinds = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.028, 0.09),
      new THREE.MeshStandardMaterial({
        color: '#14202a',
        emissive: '#8fd0ff',
        emissiveIntensity: 0,
        roughness: 0.45,
        map: labelTexture('PERSIANAS', 15),
      }),
    )
    blinds.name = 'Ship switch'
    blinds.userData.shipSwitch = 'shutters'
    blinds.position.set(1.18, 0.034, -3.5)
    room.add(blinds)
    this.switches.push(blinds)
    this.applyCabin()
    this.paintSwitches()
  }
  press(kind: ShipSwitch): void {
    if (kind === 'nav') this.navOn = !this.navOn
    if (kind === 'beacon') this.beaconOn = !this.beaconOn
    if (kind === 'spots') this.spotsOn = !this.spotsOn
    if (kind === 'cabin') this.cabinOn = !this.cabinOn
    if (kind === 'shutters') this.shuttersOn = !this.shuttersOn
    this.applyCabin()
    this.paintSwitches()
  }
  private paintSwitches(): void {
    const on: Record<ShipSwitch, boolean> = {
      nav: this.navOn,
      beacon: this.beaconOn,
      spots: this.spotsOn,
      cabin: this.cabinOn,
      shutters: this.shuttersOn,
    }
    for (const button of this.switches)
      (button.material as THREE.MeshStandardMaterial).emissiveIntensity = on[
        button.userData.shipSwitch as ShipSwitch
      ]
        ? 0.7
        : 0
  }
  update(now: number): void {
    for (const lamp of this.position) {
      const material = lamp.material as THREE.MeshBasicMaterial
      material.color.set(this.navOn ? (lamp.userData.navColor as string) : '#141414')
    }
    const flash = this.beaconOn && Math.floor(now / 420) % 2 === 0
    ;(this.beacon.material as THREE.MeshBasicMaterial).color.set(flash ? '#ff3b30' : '#141414')
    for (const bar of this.bars) bar.color.set(this.spotsOn ? '#fff6e4' : '#141414')
    for (const spot of this.spots) spot.intensity = this.spotsOn ? 2200 : 0
    const dt = this.shutterStamp ? Math.min(0.05, (now - this.shutterStamp) / 1000) : 0
    this.shutterStamp = now
    // The garage door travels 95° at 0.9 rad/s, about 1.85 s. Same duration for 0.72 m.
    const lift = this.shuttersOn ? 0.72 : 0
    const step = 0.39 * dt
    for (const part of this.shutters) {
      const target = (part.userData.shutterY as number) + lift
      const delta = target - part.position.y
      part.position.y += Math.sign(delta) * Math.min(Math.abs(delta), step)
    }
  }
  /** The hull already has the shutter meshes. The inner skin is a solid slab over those holes. */
  mountHull(model: THREE.Object3D): void {
    model.traverse((object) => {
      if (object.name.startsWith('Shutter')) {
        object.userData.shutterY = object.position.y
        this.shutters.push(object)
      }
      if (object.name.startsWith('Interior_Wall_')) object.visible = false
    })
  }
  private applyCabin(): void {
    for (const strip of this.strips) strip.emissiveIntensity = this.cabinOn ? 0.8 : 0
    for (const light of this.cabinLights) light.intensity = this.cabinOn ? 14 : 0
  }
}

function labelTexture(text: string, size = 22): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#14202a'
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = '#c6e6ff'
  ctx.font = `700 ${size}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
