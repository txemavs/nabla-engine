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
  private stern: THREE.Mesh | null = null
  private readonly sideLeds: THREE.MeshStandardMaterial[] = []
  private readonly shutters: THREE.Object3D[] = []
  private beacon: THREE.Mesh
  private readonly bars: THREE.MeshBasicMaterial[] = []
  private readonly spots: THREE.SpotLight[] = []
  private readonly strips: THREE.MeshStandardMaterial[] = []
  private readonly cabinLights: THREE.PointLight[] = []
  private readonly switches: THREE.Mesh[] = []
  constructor(room: THREE.Group, hull: THREE.Object3D) {
    const along = new THREE.CylinderGeometry(
      0.055,
      0.055,
      0.22,
      16,
      1,
      false,
      -Math.PI / 2,
      Math.PI,
    )
    const across = new THREE.CylinderGeometry(0.055, 0.055, 0.22, 16, 1, false, 0, Math.PI)
    const nav = (
      geometry: THREE.BufferGeometry,
      color: string,
      position: [number, number, number],
      rotation: [number, number, number],
    ) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: '#141414', toneMapped: false }),
      )
      mesh.name = 'Exterior nav'
      mesh.position.set(...position)
      mesh.rotation.set(...rotation)
      mesh.userData.navColor = color
      hull.add(mesh)
      return mesh
    }
    // Half-round lying along the skin, middle of the upper quarter.
    this.position = [
      nav(along, '#ff2430', [-2.532, 1.75, -2.2], [0, Math.PI / 2, 0]),
      nav(along, '#3dff6e', [2.532, 1.75, -2.2], [0, Math.PI / 2, 0]),
    ]
    this.stern = nav(across, '#f7fbff', [0, 1.75, 5.12], [0, 0, 0])
    this.position.push(this.stern)
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#141414', toneMapped: false }),
    )
    beacon.name = 'Exterior nav'
    beacon.position.set(0, 2.32, -0.6)
    beacon.userData.navColor = '#ff3b30'
    hull.add(beacon)
    this.beacon = beacon
    for (const x of [-2.532, 2.532]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(9.88, 0.04),
        new THREE.MeshStandardMaterial({
          color: '#061018',
          emissive: '#8ebaff',
          emissiveIntensity: 0,
          roughness: 0.4,
          metalness: 0,
          side: THREE.DoubleSide,
        }),
      )
      strip.name = 'Side led'
      strip.position.set(x, -0.65, 0)
      strip.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2
      hull.add(strip)
      this.sideLeds.push(strip.material as THREE.MeshStandardMaterial)
    }
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
  /** Stern nav light rides the garage door, in the hinge's own axes. */
  attachStern(hinge: THREE.Object3D): void {
    if (!this.stern) return
    hinge.add(this.stern)
    this.stern.position.set(0, 2.68, 0.04)
    this.stern.rotation.set(0, 0, 0)
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
    for (const led of this.sideLeds) led.emissiveIntensity = this.spotsOn ? 0.8 : 0
    const dt = this.shutterStamp ? Math.min(0.05, (now - this.shutterStamp) / 1000) : 0
    this.shutterStamp = now
    // 0.8 m at the garage-ramp pace (95° at 0.9 rad/s, about 1.85 s).
    const step = 0.433 * dt
    for (const panel of this.shutters) {
      const target =
        (panel.userData.baseY as number) + (this.shuttersOn ? (panel.userData.travel as number) : 0)
      const delta = target - panel.position.y
      panel.position.y += Math.sign(delta) * Math.min(Math.abs(delta), step)
    }
  }
  /**
   * Two 5 m modules per side. Each wall is four equal bands: the middle pair
   * are shutters that slide into the top and bottom bands and leave the glass.
   * The band height is also the stile on both ends of the module.
   */
  mountHull(model: THREE.Object3D): void {
    model.traverse((object) => {
      if (
        object.name.startsWith('Shutter') ||
        object.name === 'Frame_Proa' ||
        object.name === 'Frame_Popa' ||
        object.name.startsWith('Interior_Wall_') ||
        object.name.startsWith('Hull_Wall_') ||
        object.name === 'Hull_Seams' ||
        object.name === 'Brand_Text_Soluciones' ||
        object.name === 'Brand_Text_nabla' ||
        object.name === 'Brand_Agency'
      )
        object.visible = false
    })
    const frame = new THREE.MeshStandardMaterial({
      color: '#1a1e22',
      roughness: 0.62,
      metalness: 0.4,
    })
    const bezel = new THREE.MeshStandardMaterial({
      name: 'Cromo',
      color: '#d1d6db',
      roughness: 0.22,
      metalness: 1,
    })
    const plate = new THREE.MeshStandardMaterial({
      name: 'Pintura',
      color: '#515555',
      roughness: 0.32,
      metalness: 0.72,
    })
    const rail = new THREE.MeshStandardMaterial({
      color: '#2a333c',
      roughness: 0.4,
      metalness: 0.55,
    })
    const glass = new THREE.MeshStandardMaterial({
      color: '#b7c9d1',
      transparent: true,
      opacity: 0.12,
      roughness: 0.04,
      metalness: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const y0 = 0.15
    const band = 0.8
    const skin = 0.045
    const modules: [number, number][] = [
      [-4.94, 0],
      [0, 4.94],
    ]
    const box = (
      size: [number, number, number],
      at: [number, number, number],
      material: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
      mesh.position.set(...at)
      mesh.castShadow = true
      mesh.receiveShadow = true
      model.add(mesh)
      return mesh
    }
    for (const side of [1, -1]) {
      // Outer skin and inner skin leave a slot. The leaves run in that slot.
      const outer = side * 2.505
      const inner = side * 2.375
      const upperX = side * 2.455
      const lowerX = side * 2.412
      for (const [z0, z1] of modules) {
        const length = z1 - z0
        const mid = (z0 + z1) / 2
        const opening = length - band * 2
        for (const x of [outer, inner]) {
          box([skin, band, length], [x, y0 + 3.5 * band, mid], frame)
          box([skin, band, length], [x, y0 + 0.5 * band, mid], frame)
          box([skin, band * 2, band], [x, y0 + 2 * band, z0 + band / 2], frame)
          box([skin, band * 2, band], [x, y0 + 2 * band, z1 - band / 2], frame)
        }
        // Chrome bezel sits entirely outside the outer face, so it does not z-fight the skin.
        const lip = 0.05
        const proud = 0.02
        const face = Math.abs(outer) + skin / 2
        const bezelX = side * (face + proud / 2)
        box([proud, lip, opening], [bezelX, y0 + 3 * band - lip / 2, mid], bezel)
        box([proud, lip, opening], [bezelX, y0 + band + lip / 2, mid], bezel)
        box([proud, band * 2, lip], [bezelX, y0 + 2 * band, z0 + band - lip / 2], bezel)
        box([proud, band * 2, lip], [bezelX, y0 + 2 * band, z1 - band + lip / 2], bezel)
        // Tracks, in the slot, along both stiles.
        for (const z of [z0 + band + 0.02, z1 - band - 0.02])
          box([0.02, band * 2 - lip * 2, 0.02], [side * 2.4, y0 + 2 * band, z], rail)
        const pane = new THREE.Mesh(
          new THREE.PlaneGeometry(opening - lip * 2, band * 2 - lip * 2),
          glass,
        )
        pane.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
        pane.position.set(side * 2.39, y0 + 2 * band, mid)
        pane.renderOrder = 2
        model.add(pane)
        const leaf = (x: number, y: number, travel: number, astragal: boolean) => {
          const group = new THREE.Group()
          group.position.set(x, y, mid)
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, band, opening - 0.01), plate)
          panel.castShadow = true
          panel.receiveShadow = true
          group.add(panel)
          if (astragal) {
            const stop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, opening - 0.01), rail)
            stop.position.y = -band / 2
            stop.position.x = side * -0.02
            group.add(stop)
          }
          model.add(group)
          group.userData.baseY = y
          group.userData.travel = travel
          this.shutters.push(group)
        }
        leaf(upperX, y0 + 2.5 * band, band, true)
        leaf(lowerX, y0 + 1.5 * band, -band, false)
      }
    }
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
