import { Vector3, type Scene } from 'three'
import { VehicleAudio } from '../audio/vehicle.js'
import { resolveVehicleSound, type ResolvedVehicleSound } from '../audio/vehicle-sound.js'
import { roadVehicleDefaults } from '../config/simulation.js'
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
  private gearChangeCount = 0
  /** `vehicleId:ignitionCount` of the last start whose starter sound was played. */
  private lastStart: string | null = null

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
    const sound = resolveVehicleSound(piloted?.vehicle?.audio, car?.engineMode)
    this.playGearChanges(car ? pilot! : null, car, sound)
    this.playEngineStart(car ? pilot! : null, car, piloted?.vehicle?.powertrain?.idleRpm)
    // The engine note stays silent while the starter cranks; it fades in at the catch and
    // settles to idle during the needle sweep.
    this.audio.powertrain(
      car?.helm !== 'off' && car?.ignition !== 'cranking' ? (car?.rpm ?? 0) : 0,
      car?.engineLoad ?? 0,
      { turbo: sound.turbo, engine: sound.engine },
    )
    this.audio.reverseAlarm(
      !!(piloted?.vehicle?.reverseAlarm && car?.reversing && car.helm !== 'off'),
    )
  }

  /**
   * Gear-change sound per the vehicle's `audio.gearShift`. `clack` (default): one clack per
   * audible change (D/R engagement or manual shift, never an automatic shift). `click`: one
   * quiet click per counted gear change, automatic ones included. `none`: silent. The first
   * sample of a vehicle only sets the baseline.
   */
  private playGearChanges(
    id: string | null,
    info: {
      gearClacks: number
      gearShifts: number
      gearClack: GearClackProfile | null
      helm: string
    } | null,
    sound: ResolvedVehicleSound,
  ): void {
    if (!id || !info) {
      this.shiftVehicleId = null
      return
    }
    const known = this.shiftVehicleId === id
    const previousClacks = this.shiftCount,
      previousShifts = this.gearChangeCount
    this.shiftVehicleId = id
    this.shiftCount = info.gearClacks
    this.gearChangeCount = info.gearShifts
    if (!known || info.helm === 'off') return
    if (sound.gearShift === 'clack' && info.gearClacks > previousClacks)
      this.audio.gearChange(
        sound.gearShiftVolume === 1
          ? info.gearClack
          : {
              ...info.gearClack,
              gain: (info.gearClack?.gain ?? 1) * sound.gearShiftVolume,
            },
      )
    else if (sound.gearShift === 'click' && info.gearShifts > previousShifts)
      this.audio.gearClick({ volume: sound.gearShiftVolume })
  }

  /** One starter sound per start-up, as soon as its cranking phase (the first one) is seen. Lower idle cranks lower. */
  private playEngineStart(
    id: string | null,
    info: { ignition: string; ignitionCount: number; helm: string } | null,
    idleRpm: number | undefined,
  ): void {
    if (!id || !info || info.ignition !== 'cranking' || info.helm === 'off') return
    const key = `${id}:${info.ignitionCount}`
    if (key === this.lastStart) return
    this.lastStart = key
    const idle = idleRpm ?? roadVehicleDefaults.idleRpm
    this.audio.engineStart({ pitch: idle / roadVehicleDefaults.idleRpm, idleRpm: idle })
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
    const speedKmh = pilot ? sim!.vehicleInfo(pilot).speedKmh : 0
    this.audio.tires(slip, speedKmh)
    this.audio.scrape(pilot ? (sim!.twoWheeledPose(pilot)?.scrape ?? 0) : 0, speedKmh)
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
