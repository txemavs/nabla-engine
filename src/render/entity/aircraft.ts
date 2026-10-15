import * as THREE from 'three'

/** Asset-supplied hinges, in chassis metres; no aircraft names or physics live here. */
export interface AircraftRigDefinition {
  controls: {
    node: string
    kind: 'sweep' | 'stabilator'
    pivot: [number, number, number]
    side: number
  }[]
  exhausts: [number, number, number][]
}
export interface AircraftPose {
  engine: number
  flightSpeedMode: 'slow' | 'fast'
  flightControls: { pitch: number; roll: number; yaw: number }
}
/** The ordinary vehicle presenter animates the same rig in desktop, VR and AR. */
export class AircraftRig {
  private controls: {
    pivot: THREE.Group
    kind: 'sweep' | 'stabilator'
    side: number
    angle: number
  }[] = []
  private exhausts: THREE.MeshStandardMaterial[] = []
  constructor(model: THREE.Object3D, definition: AircraftRigDefinition) {
    model.updateWorldMatrix(true, true)
    for (const control of definition.controls) {
      const object = model.getObjectByName(control.node)
      if (!object) continue
      const pivot = new THREE.Group()
      pivot.name = `Aircraft_${control.kind}_${control.side}`
      pivot.position.fromArray(control.pivot)
      model.add(pivot)
      pivot.updateWorldMatrix(true, false)
      pivot.attach(object)
      this.controls.push({ pivot, kind: control.kind, side: control.side, angle: 0 })
    }
    for (const position of definition.exhausts) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x441707,
        emissive: 0xff6a16,
        emissiveIntensity: 0,
        roughness: 1,
        side: THREE.DoubleSide,
      })
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.53, 16), material)
      disc.name = 'Aircraft_Exhaust'
      disc.position.fromArray(position)
      model.add(disc)
      this.exhausts.push(material)
    }
  }
  update(pose: AircraftPose, dt: number): void {
    const alpha = 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 5)
    for (const control of this.controls) {
      const target =
        control.kind === 'sweep'
          ? pose.flightSpeedMode === 'fast'
            ? (-control.side * 48 * Math.PI) / 180
            : 0
          : THREE.MathUtils.clamp(
              -pose.flightControls.pitch * 0.3 + control.side * pose.flightControls.roll * 0.2,
              -0.42,
              0.42,
            )
      control.angle += (target - control.angle) * alpha
      control.pivot.rotation[control.kind === 'sweep' ? 'y' : 'x'] = control.angle
    }
    for (const material of this.exhausts)
      material.emissiveIntensity = THREE.MathUtils.clamp(pose.engine, 0, 1) ** 2 * 5
  }
}
export function mountAircraft(model: THREE.Object3D): AircraftRig | null {
  let definition: AircraftRigDefinition | undefined
  model.traverse((object) => {
    if (object.userData.aircraftRig) definition = object.userData.aircraftRig
  })
  return definition ? new AircraftRig(model, definition) : null
}
