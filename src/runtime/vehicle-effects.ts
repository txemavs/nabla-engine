import { Vector3, type Scene } from 'three'
import { VehicleAudio } from '../audio/vehicle.js'
import { TireMarks } from '../render/entity/tire-marks.js'
import { TireSmoke } from '../render/entity/tire-smoke.js'
import type { SceneDocument } from '../scene/document.js'
import type { Simulation } from '../simulation/simulation.js'
import type { GearClackProfile } from '../simulation/vehicles/wheeled/contracts.js'

/** Shared audio/effects orchestration. Supplied audio remains owned by the host. */
export class VehicleEffects {
  readonly smoke = new TireSmoke()
  readonly marks = new TireMarks()
  readonly audio: VehicleAudio
  private readonly ownsAudio: boolean
  private disposed = false
  private shiftVehicleId: string | null = null
  private shiftCount = 0

  constructor(scene: Scene, audio?: VehicleAudio) {
    this.ownsAudio = !audio
    this.audio = audio ?? new VehicleAudio()
    scene.add(this.smoke.root, this.marks.root)
  }

  updateAudio(sim: Simulation | null, document: SceneDocument, eye: Vector3): void {
    if (this.disposed) return
    let flightLevel = 0,
      flightSpeed = 0
    if (sim)
      for (const entity of document.entities) {
        if (!entity.vehicle?.flight || entity.vehicle.plane) continue
        const info = sim.vehicleInfo(entity.id)
        if (!info.flightMode) continue
        const position = sim.entityTransform(entity.id, true).position
        const distance = eye.distanceTo(new Vector3(...position))
        const level =
          sim.player.vehicleId === entity.id || sim.player.interiorId === entity.id
            ? 0.55
            : Math.max(0, 1 - distance / 100)
        if (level > flightLevel) {
          flightLevel = level
          flightSpeed = info.speedKmh
        }
      }
    this.audio.turbine(flightLevel, flightSpeed)
    const pilot = sim?.player.vehicleId
    const piloted = pilot ? document.entities.find((entity) => entity.id === pilot) : undefined
    this.audio.propeller(piloted?.vehicle?.plane ? sim!.vehicleInfo(pilot!).engine : 0)
    const car =
      pilot &&
      piloted?.vehicle &&
      !piloted.vehicle.passive &&
      !piloted.vehicle.boat &&
      !piloted.vehicle.flight
        ? sim!.vehicleInfo(pilot)
        : null
    this.playGearChanges(car ? pilot! : null, car)
    this.audio.powertrain(car?.helm !== 'off' ? (car?.rpm ?? 0) : 0, car?.engineLoad ?? 0)
  }

  /** One clack per audible gear change (D/R engagement or manual shift, never an automatic shift); the first sample of a vehicle only sets the baseline. */
  private playGearChanges(
    id: string | null,
    info: { gearClacks: number; gearClack: GearClackProfile | null; helm: string } | null,
  ): void {
    if (!id || !info) {
      this.shiftVehicleId = null
      return
    }
    const known = this.shiftVehicleId === id
    const previous = this.shiftCount
    this.shiftVehicleId = id
    this.shiftCount = info.gearClacks
    if (known && info.gearClacks > previous && info.helm !== 'off')
      this.audio.gearChange(info.gearClack)
  }

  updateTires(sim: Simulation | null, elapsed: number, origin: Vector3): void {
    if (this.disposed) return
    if (!sim) {
      this.smoke.clear()
      this.marks.clear()
    }
    const pilot = sim?.player.vehicleId
    const contacts = pilot ? sim!.wheelContactInfo(pilot) : []
    const slip = Math.max(0, ...contacts.map((wheel) => wheel.slip))
    this.smoke.update(
      elapsed,
      contacts
        .filter((wheel) => wheel.slip > 0.22)
        .flatMap((wheel) => (wheel.contactPoint ? [wheel.contactPoint] : [])),
      slip,
      origin,
    )
    this.marks.update(elapsed, pilot ?? null, contacts, origin)
    this.audio.tires(slip, pilot ? sim!.vehicleInfo(pilot).speedKmh : 0)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.smoke.root.removeFromParent()
    this.marks.root.removeFromParent()
    this.smoke.dispose()
    this.marks.dispose()
    if (this.ownsAudio) this.audio.dispose()
  }
}
