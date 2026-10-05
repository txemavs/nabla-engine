import { afterEach, describe, expect, it } from 'vitest'
import {
  controlProfile,
  controlProfiles,
  controlSurfaces,
  hasControlProfile,
  inferControlProfileId,
  registerControlProfile,
  resolveControlProfile,
  touchRigState,
  unregisterControlProfile,
} from '../../src/runtime/control-profiles.js'
import { hudTelemetry, type GameHudState } from '../../src/runtime/hud.js'
import { presetVehicle, vehiclePresets } from '../../src/catalog/vehicles/library.js'
import { vehicleField } from '../../src/entity/vehicle/field.js'

const interior = { min: [0, 0, 0], max: [1, 1, 1], exit: [0, 0, 0] } as {
  min: [number, number, number]
  max: [number, number, number]
  exit: [number, number, number]
}

/** Seat → profile → surfaces, the same path GameRuntime.frame takes. */
function seat(catalogId: string | null, flightMode = false) {
  const vehicle = catalogId ? presetVehicle(catalogId, 'v').vehicle : null
  const surfaces = controlSurfaces(resolveControlProfile(vehicle, { flightMode }))
  return { surfaces, rigs: touchRigState(surfaces.touch, true) }
}

describe('stock vehicle control profiles', () => {
  it('every stock preset declares a registered profile', () => {
    for (const preset of vehiclePresets()) {
      expect(preset.vehicle.controls, preset.id).toBeDefined()
      expect(hasControlProfile(preset.vehicle.controls!), preset.id).toBe(true)
      // The declaration agrees with what inference would pick for old scenes.
      expect(preset.vehicle.controls, preset.id).toBe(
        inferControlProfileId({ ...preset.vehicle, controls: undefined }),
      )
    }
  })

  it('maps foot, car, truck, carrier and trailers to their profiles', () => {
    expect(seat(null).surfaces.profile).toBe('none')
    expect(seat('car').surfaces.profile).toBe('road')
    expect(seat('a3').surfaces.profile).toBe('road')
    expect(seat('white-truck').surfaces.profile).toBe('road')
    expect(seat('carrier').surfaces.profile).toBe('flight')
    expect(seat('white-trailer').surfaces.profile).toBe('none')
    expect(seat('white-trailer-chassis').surfaces.profile).toBe('none')
  })
})

describe('HUD visibility per profile', () => {
  it('road: wheel rig and speedometer with gear', () => {
    for (const id of ['car', 'white-truck']) {
      const { surfaces, rigs } = seat(id)
      expect(surfaces).toMatchObject({ touch: 'road', speed: true, gear: true })
      expect(rigs.driving).toEqual({ active: true, hidden: false, seatedRoad: true })
      expect(rigs.flight.active).toBe(false)
    }
  })

  it('carrier: Mode 2 sticks only, no wheel and no speedometer', () => {
    for (const flying of [false, true]) {
      const { surfaces, rigs } = seat('carrier', flying)
      expect(surfaces).toEqual({ profile: 'flight', touch: 'flight', speed: false, gear: false })
      expect(rigs.flight.active).toBe(true)
      expect(rigs.driving).toEqual({ active: false, hidden: true, seatedRoad: false })
    }
  })

  it('on foot and trailers: action bar only, no telemetry', () => {
    for (const id of [null, 'white-trailer']) {
      const { surfaces, rigs } = seat(id)
      expect(surfaces).toEqual({ profile: 'none', touch: null, speed: false, gear: false })
      expect(rigs.driving).toEqual({ active: true, hidden: false, seatedRoad: false })
      expect(rigs.flight.active).toBe(false)
    }
  })

  it('hides every rig when not playing', () => {
    for (const touch of ['road', 'flight', null] as const) {
      const rigs = touchRigState(touch, false)
      expect(rigs.driving.active).toBe(false)
      expect(rigs.driving.hidden).toBe(true)
      expect(rigs.flight.active).toBe(false)
    }
  })

  it('GameHud telemetry follows the profile flags', () => {
    const base: GameHudState = {
      speedKmh: 41.6,
      gear: 3,
      gearLabel: 'D3',
      vehicle: 'S3',
      cameraMode: 'cockpit',
      interaction: '',
      wheelDebug: '',
    }
    const road = controlSurfaces(controlProfile('road'))
    const flight = controlSurfaces(controlProfile('flight'))
    expect(hudTelemetry({ ...base, showSpeed: road.speed, showGear: road.gear })).toBe(
      'S3 · 42 km/h · D3',
    )
    expect(
      hudTelemetry({ ...base, vehicle: 'Carrier', showSpeed: flight.speed, showGear: flight.gear }),
    ).toBe('Carrier')
    expect(hudTelemetry({ ...base, vehicle: null })).toBeNull()
    // Hosts that never pass the flags keep the legacy road readout.
    expect(hudTelemetry(base)).toBe('S3 · 42 km/h · D3')
  })
})

describe('control profile resolution', () => {
  it('infers a profile when a vehicle omits `controls`', () => {
    expect(inferControlProfileId(null)).toBe('none')
    expect(inferControlProfileId({})).toBe('road')
    expect(inferControlProfileId({ passive: true })).toBe('none')
    expect(inferControlProfileId({ interior })).toBe('flight')
    expect(inferControlProfileId({ flight: true })).toBe('flight')
    expect(inferControlProfileId({ boat: true })).toBe('none')
    expect(inferControlProfileId({ plane: true })).toBe('none')
  })

  it('an explicit declaration wins over inference', () => {
    expect(resolveControlProfile({ controls: 'none' }).id).toBe('none')
    expect(resolveControlProfile({ interior, controls: 'road' }).id).toBe('road')
    expect(resolveControlProfile({ boat: true, controls: 'road' }).id).toBe('road')
  })

  it('road drops to none in flight mode; flight stays flight', () => {
    expect(resolveControlProfile({ controls: 'road' }, { flightMode: true }).id).toBe('none')
    expect(resolveControlProfile({ controls: 'flight' }, { flightMode: true }).id).toBe('flight')
  })

  it('an unknown id falls back to none instead of showing the wrong rig', () => {
    expect(resolveControlProfile({ controls: 'hovercraft' }).id).toBe('none')
    expect(() => controlProfile('hovercraft')).toThrow(/No control profile/)
  })

  it('the vehicle schema accepts profile ids and rejects malformed ones', () => {
    const vehicle = presetVehicle('car', 'v').vehicle!
    expect(vehicleField.safeParse({ ...vehicle, controls: 'boat' }).success).toBe(true)
    expect(vehicleField.safeParse({ ...vehicle, controls: 'Road!' }).success).toBe(false)
  })
})

describe('registering a new profile', () => {
  afterEach(() => {
    if (hasControlProfile('boat')) unregisterControlProfile('boat')
  })

  it('a host profile resolves from data without touching browser.ts', () => {
    registerControlProfile({
      id: 'boat',
      description: 'Outboard: road rig for throttle/rudder, speed but no gearbox.',
      touch: 'road',
      hud: { speed: true, gear: false },
    })
    expect(controlProfiles().map((p) => p.id)).toEqual(['none', 'road', 'flight', 'boat'])
    const surfaces = controlSurfaces(resolveControlProfile({ boat: true, controls: 'boat' }))
    expect(surfaces).toEqual({ profile: 'boat', touch: 'road', speed: true, gear: false })
    expect(touchRigState(surfaces.touch, true).driving.seatedRoad).toBe(true)
  })

  it('rejects duplicates, bad ids, unknown rigs and removing built-ins', () => {
    const boat = {
      id: 'boat',
      description: 'x',
      touch: null,
      hud: { speed: false, gear: false },
    } as const
    registerControlProfile(boat)
    expect(() => registerControlProfile(boat)).toThrow(/already registered/)
    expect(() =>
      registerControlProfile({ ...boat, hud: { speed: true, gear: false } }, { replace: true }),
    ).not.toThrow()
    expect(controlProfile('boat').hud.speed).toBe(true)
    expect(() => registerControlProfile({ ...boat, id: 'Bad Id' })).toThrow(/Invalid/)
    expect(() =>
      registerControlProfile({ ...boat, id: 'sub', touch: 'sonar' as unknown as null }),
    ).toThrow(/unknown touch rig/)
    expect(() => unregisterControlProfile('road')).toThrow(/built in/)
  })

  it('registered profiles are frozen copies', () => {
    const hud = { speed: true, gear: true }
    registerControlProfile({ id: 'boat', description: 'x', touch: 'road', hud })
    hud.speed = false
    expect(controlProfile('boat').hud.speed).toBe(true)
    expect(Object.isFrozen(controlProfile('boat').hud)).toBe(true)
  })
})
