/**
 * Per-vehicle control profiles: which on-screen controls and HUD readouts a seat gets.
 *
 * A vehicle declares its profile in data (`vehicle.controls` in the preset JSON or the
 * scene entity). The browser runtime resolves the profile every frame and drives the
 * touch rigs and HUD from it, so a new vehicle type needs a preset field, not a new
 * branch in `browser.ts`. Hosts add profiles with `registerControlProfile`.
 * See docs/vehicle-controls.md.
 */
import type { VehicleDefinition } from '../entity/vehicle/field.js'

/** On-screen rig drawn while seated. `null` keeps only the action bar (enter/exit, camera). */
export type ControlTouchRig = 'road' | 'flight' | null

/** Built-in profile ids. Hosts may register more; any registered id is valid in data. */
export type BuiltInControlProfileId = 'none' | 'road' | 'flight'

export interface ControlProfile {
  /** Data id used in `vehicle.controls`: lowercase letters, digits and dashes. */
  readonly id: string
  /** Short English description for docs and debugging. */
  readonly description: string
  /**
   * `road`: TouchDriving wheel, accelerator, handbrake and turbo.
   * `flight`: TouchFlight Mode 2 sticks (left climb/yaw, right pitch/roll) with their own bar.
   * `null`: TouchDriving action bar only, so touch players can still board and change camera.
   */
  readonly touch: ControlTouchRig
  /** HUD readouts shown by GameHud and passed to hosts through `GameFrame.controls`. */
  readonly hud: { readonly speed: boolean; readonly gear: boolean }
  /**
   * Profile used while the vehicle is in flight mode (`vehicleInfo().flightMode`).
   * Road controls on a flight-capable chassis drop to `none` in the air.
   */
  readonly inFlight?: string
}

/** Resolved per-frame view of the active profile, as exposed to hosts in `GameFrame`. */
export interface ControlSurfaces {
  /** Resolved profile id after flight-mode fallback. */
  profile: string
  touch: ControlTouchRig
  speed: boolean
  gear: boolean
}

/** Vehicle fields read by inference when `controls` is omitted. */
export type ControlProfileVehicle = Pick<
  Partial<VehicleDefinition>,
  'controls' | 'passive' | 'flight' | 'plane' | 'boat' | 'interior' | 'garage'
>

export interface ControlProfileContext {
  /** True while the vehicle is flying (carrier `V` mode or a flight-capable chassis). */
  flightMode?: boolean
}

const PROFILE_ID = /^[a-z0-9-]{1,40}$/

const builtIns: readonly ControlProfile[] = [
  {
    id: 'none',
    description: 'On foot, trailers and seats without a touch rig: action bar only, no telemetry.',
    touch: null,
    hud: { speed: false, gear: false },
  },
  {
    id: 'road',
    description: 'Cars and trucks: steering wheel, accelerator, handbrake, speedometer and gear.',
    touch: 'road',
    hud: { speed: true, gear: true },
    inFlight: 'none',
  },
  {
    id: 'flight',
    description: 'Carrier and drones: Mode 2 sticks only; speed lives on the helm monitors.',
    touch: 'flight',
    hud: { speed: false, gear: false },
  },
]

const registry = new Map<string, ControlProfile>(builtIns.map((p) => [p.id, freeze(p)]))

function freeze(profile: ControlProfile): ControlProfile {
  return Object.freeze({ ...profile, hud: Object.freeze({ ...profile.hud }) })
}

/**
 * Add a control profile, or replace one with `{ replace: true }`.
 * Register before play so the first frame already resolves it.
 */
export function registerControlProfile(
  profile: ControlProfile,
  options: { replace?: boolean } = {},
): void {
  if (!PROFILE_ID.test(profile.id)) throw new Error(`Invalid control profile id "${profile.id}"`)
  if (profile.touch !== null && profile.touch !== 'road' && profile.touch !== 'flight')
    throw new Error(`Control profile "${profile.id}" has an unknown touch rig`)
  if (registry.has(profile.id) && !options.replace)
    throw new Error(`Control profile "${profile.id}" is already registered`)
  if (profile.inFlight !== undefined && !PROFILE_ID.test(profile.inFlight))
    throw new Error(`Control profile "${profile.id}" has an invalid inFlight id`)
  registry.set(profile.id, freeze(profile))
}

/** Remove a host profile. Built-in profiles cannot be removed. */
export function unregisterControlProfile(id: string): void {
  if (builtIns.some((p) => p.id === id)) throw new Error(`Control profile "${id}" is built in`)
  registry.delete(id)
}

export function hasControlProfile(id: string): boolean {
  return registry.has(id)
}

/** Registered profile, or throws for an unknown id. */
export function controlProfile(id: string): ControlProfile {
  const profile = registry.get(id)
  if (!profile) throw new Error(`No control profile "${id}"`)
  return profile
}

/** Every registered profile, built-ins first, then hosts in registration order. */
export function controlProfiles(): ControlProfile[] {
  return [...registry.values()]
}

/**
 * Profile id for a vehicle without an explicit `controls` field (old scenes, custom presets).
 * On foot and passive trailers: `none`. Carriers (garage or interior) and flight-capable
 * chassis: `flight`. Boats and planes have no touch rig yet: `none`. Everything else: `road`.
 */
export function inferControlProfileId(vehicle: ControlProfileVehicle | null | undefined): string {
  if (!vehicle || vehicle.passive) return 'none'
  if (vehicle.garage || vehicle.interior || vehicle.flight) return 'flight'
  if (vehicle.boat || vehicle.plane) return 'none'
  return 'road'
}

/**
 * The profile that applies to the seated player. `null` means on foot (including walking
 * inside a carrier). An explicit `controls` id wins over inference; an unregistered id
 * falls back to `none` so a typo never shows the wrong controls.
 */
export function resolveControlProfile(
  vehicle: ControlProfileVehicle | null | undefined,
  context: ControlProfileContext = {},
): ControlProfile {
  const declared = vehicle?.controls ?? inferControlProfileId(vehicle)
  let profile = registry.get(declared) ?? registry.get('none')!
  if (context.flightMode && profile.inFlight)
    profile = registry.get(profile.inFlight) ?? registry.get('none')!
  return profile
}

/** Flatten a profile into the visibility flags hosts and HUDs read each frame. */
export function controlSurfaces(profile: ControlProfile): ControlSurfaces {
  return {
    profile: profile.id,
    touch: profile.touch,
    speed: profile.hud.speed,
    gear: profile.hud.gear,
  }
}

/** Activity and visibility of the two built-in touch rigs for a resolved touch rig. */
export interface TouchRigState {
  /** TouchDriving (action bar, plus wheel/pedals when `seatedRoad`). */
  driving: { active: boolean; hidden: boolean; seatedRoad: boolean }
  /** TouchFlight Mode 2 sticks and their own action bar. */
  flight: { active: boolean }
}

/**
 * Map a touch rig onto the TouchDriving/TouchFlight overlays. Exactly one overlay is live
 * while playing: flight hides the road overlay entirely; road and `null` share TouchDriving,
 * and only road reveals the wheel, accelerator and handbrake.
 */
export function touchRigState(touch: ControlTouchRig, playing: boolean): TouchRigState {
  const flight = touch === 'flight'
  return {
    driving: {
      active: playing && !flight,
      hidden: !playing || flight,
      seatedRoad: touch === 'road',
    },
    flight: { active: playing && flight },
  }
}
