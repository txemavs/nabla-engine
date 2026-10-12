/**
 * Firearm state for one sidearm, separate from its presentation. Semi-automatic: one shot per
 * trigger press, and only once the slide has returned to battery. The slide stays back on an
 * empty magazine. A reload drops the current magazine (its cartridges with it), seats a full one
 * and releases the slide; with a round already chambered the slide is not run, so the chambered
 * round is kept.
 */
import { createMagazine, type MagazineEntity } from './magazine.js'

export interface FirearmSpec {
  magazineCapacity: number
  /** Spawn loadout; reloads consume existing items, never refill them. */
  spareMagazines?: number
  chamber: number
  cycleMs: number
  reloadMs: { magazineOut: number; magazineIn: number; slideRelease: number }
}

export type ReloadPhase = 'none' | 'magazine-out' | 'magazine-in' | 'slide-release'

export interface FirearmState {
  magazineEntity: MagazineEntity | null
  spareMagazines: MagazineEntity[]
  pendingMagazine: MagazineEntity | null
  detachedMagazine: MagazineEntity | null
  stopAfterInsertion?: boolean
  /** Cartridges in the seated magazine (0 when none is seated). */
  magazine: number
  /** A magazine is in the pistol. */
  magazineSeated: boolean
  chamber: number
  slideLocked: boolean
  /** Slide travel, 0 (in battery) .. 1 (fully back), for the presentation. */
  slide: number
  reload: ReloadPhase
  reloadStartMs: number
  /** Workshop manipulation: finish only the requested step, then wait. */
  reloadAction?: ReloadPhase
  manualRackBack?: boolean
  /** Keep a manual rack fully rearward until the user releases the control. */
  manualRackHeld?: boolean
  manualSlideTravel?: number
  /** The trigger is still held from the last press: it has to be released (reset) first. */
  triggerHeld: boolean
  lastShotMs: number
  /** When the slide was last released forward, ms. */
  slideReleaseMs: number
}

export interface FirearmEvent {
  droppedMagazine?: MagazineEntity
  fired: boolean
  /** The slide just locked open on the last round. */
  locked: boolean
  reloadStarted: boolean
  /** A magazine fell free (with any cartridges left in it). */
  magazineDropped: boolean
  magazineSeated: boolean
  /** The slide ran forward and chambered a round. */
  slideReleased: boolean
  /** Trigger pressed with the slide forward on an empty chamber: the hammer falls, click. */
  dry: boolean
  cartridgeEjected?: boolean
}

/** Continuous viewer slide manipulation, sharing the same ammunition state. */
export function moveSlide(
  state: FirearmState,
  _spec: FirearmSpec,
  travel: number,
  _now: number,
): FirearmEvent {
  const event = empty()
  state.slide = Math.max(0, Math.min(1, travel))
  state.manualSlideTravel = state.slide > 0.01 ? state.slide : undefined
  if (state.slide >= 0.75 && !state.manualRackBack) {
    event.cartridgeEjected = state.chamber > 0
    state.chamber = 0
    state.manualRackBack = true
  }
  if (state.slide <= 0.01 && state.manualRackBack) {
    if (state.magazineSeated && state.magazine > 0) {
      state.magazine--
      state.chamber = 1
    }
    state.slideLocked = state.magazineSeated && state.magazine === 0 && state.chamber === 0
    state.manualRackBack = false
    state.slideReleaseMs = -Infinity
    event.slideReleased = true
  }
  return event
}

export function freshFirearm(spec: FirearmSpec): FirearmState {
  return {
    magazineEntity: createMagazine(spec.magazineCapacity),
    spareMagazines: Array.from({ length: spec.spareMagazines ?? 3 }, () =>
      createMagazine(spec.magazineCapacity),
    ),
    pendingMagazine: null,
    detachedMagazine: null,
    stopAfterInsertion: false,
    get magazine() {
      return this.magazineEntity?.rounds ?? 0
    },
    set magazine(value: number) {
      if (this.magazineEntity)
        this.magazineEntity.rounds = Math.max(
          0,
          Math.min(this.magazineEntity.capacity, Math.floor(value)),
        )
    },
    magazineSeated: true,
    chamber: spec.chamber,
    slideLocked: false,
    slide: 0,
    reload: 'none',
    reloadStartMs: -Infinity,
    reloadAction: undefined,
    manualRackBack: false,
    manualSlideTravel: undefined,
    triggerHeld: false,
    lastShotMs: -Infinity,
    slideReleaseMs: -Infinity,
  }
}

/** A reload request at `now` (ms). Nothing when one is running or the pistol is full. */
export function beginReload(state: FirearmState, spec: FirearmSpec, now: number): FirearmEvent {
  const event = empty()
  if (state.reload !== 'none') return event
  if (!state.spareMagazines.length) return event
  if (
    state.magazineSeated &&
    state.magazine >= spec.magazineCapacity &&
    state.chamber >= spec.chamber
  )
    return event
  event.reloadStarted = true
  state.pendingMagazine = state.spareMagazines.shift()!
  state.reloadAction = undefined
  state.stopAfterInsertion = false
  state.manualSlideTravel = undefined
  state.reload = 'magazine-out'
  state.reloadStartMs = now
  return event
}

/** Insert a newly supplied item; the game's unlimited reserve creates a distinct full magazine. */
export function insertFreshMagazine(
  state: FirearmState,
  spec: FirearmSpec,
  now: number,
): FirearmEvent {
  if (state.reload !== 'none' || state.magazineSeated || now - state.lastShotMs < spec.cycleMs)
    return empty()
  state.detachedMagazine = createMagazine(spec.magazineCapacity)
  return beginReloadAction(state, spec, 'magazine-in', now)
}

/** Replace an item from the unlimited supply; leave slide release to the player. */
export function swapFreshMagazine(
  state: FirearmState,
  spec: FirearmSpec,
  now: number,
): FirearmEvent {
  if (state.reload !== 'none' || now - state.lastShotMs < spec.cycleMs) return empty()
  if (!state.magazineSeated) return insertFreshMagazine(state, spec, now)
  state.pendingMagazine = createMagazine(spec.magazineCapacity)
  state.reloadAction = undefined
  state.stopAfterInsertion = true
  state.reload = 'magazine-out'
  state.reloadStartMs = now
  const event = empty()
  event.reloadStarted = true
  return event
}

/** Release the catch only. This does not rack the slide or eject a chambered cartridge. */
export function releaseSlide(state: FirearmState, now: number): FirearmEvent {
  const event = empty()
  if (state.reload !== 'none' || !state.slideLocked) return event
  state.slideLocked = false
  state.manualRackBack = false
  state.manualSlideTravel = undefined
  if (state.chamber === 0 && state.magazineSeated && state.magazine > 0) {
    state.magazine--
    state.chamber = 1
  }
  state.slideReleaseMs = now
  event.slideReleased = true
  return event
}

/** Independently operated magazine and slide actions for the interactive viewer. */
export function beginReloadAction(
  state: FirearmState,
  spec: FirearmSpec,
  action: Exclude<ReloadPhase, 'none'>,
  now: number,
): FirearmEvent {
  const event = empty()
  if (state.reload !== 'none' || now - state.lastShotMs < spec.cycleMs) return event
  if (action === 'magazine-out' && !state.magazineSeated) return event
  if (action === 'magazine-in' && state.magazineSeated) return event
  if (action === 'magazine-in') {
    state.pendingMagazine = state.detachedMagazine ?? state.spareMagazines.shift() ?? null
    if (!state.pendingMagazine) return event
    state.detachedMagazine = null
  }
  state.reload = action
  state.reloadAction = action
  if (action === 'slide-release') state.manualSlideTravel = undefined
  const offset =
    action === 'magazine-in'
      ? spec.reloadMs.magazineOut
      : action === 'slide-release'
        ? spec.reloadMs.magazineIn
        : 0
  state.reloadStartMs = now - offset
  event.reloadStarted = true
  return event
}

/**
 * One trigger sample (pressed or released) at `now` (ms). A shot needs a fresh press (the trigger
 * reset after the last one), the slide in battery with the cycle finished, and a chambered round.
 */
export function trigger(
  state: FirearmState,
  spec: FirearmSpec,
  pressed: boolean,
  now: number,
): FirearmEvent {
  const event = empty()
  if (!pressed) {
    state.triggerHeld = false
    return event
  }
  if (state.triggerHeld) return event
  state.triggerHeld = true
  // Hands busy with a reload, or the slide not in battery: the trigger does nothing.
  if (
    state.reload !== 'none' ||
    state.manualSlideTravel !== undefined ||
    now - state.lastShotMs < spec.cycleMs
  )
    return event
  if (state.slideLocked || state.chamber <= 0) {
    event.dry = true
    return event
  }
  state.chamber = 0
  state.lastShotMs = now
  // A shot runs the slide: the reload clock must not read it as a fresh release.
  state.slideReleaseMs = -Infinity
  if (state.magazineSeated && state.magazine > 0) {
    state.magazine -= 1
    state.chamber = 1
  } else if (state.magazineSeated) {
    // The follower lifts the slide release: the slide stays back on the empty magazine.
    state.slideLocked = true
    event.locked = true
  }
  // No magazine: the slide returns on an empty chamber (USP: no magazine disconnect).
  event.fired = true
  return event
}

/** Advance the slide and an in-progress reload to `now` (ms). */
export function advanceFirearm(state: FirearmState, spec: FirearmSpec, now: number): FirearmEvent {
  const event = empty()
  if (state.reload !== 'none') {
    let age = now - state.reloadStartMs
    const { magazineOut, magazineIn, slideRelease } = spec.reloadMs
    // A held manual rack pauses at full travel, before feeding the next cartridge.
    const pulledBackAt = magazineIn + (slideRelease - magazineIn) / 2
    if (state.manualRackHeld && state.reloadAction === 'slide-release' && age >= pulledBackAt) {
      age = pulledBackAt
      state.reloadStartMs = now - age
    }
    if (
      state.reload === 'slide-release' &&
      state.reloadAction &&
      age >= magazineIn + (slideRelease - magazineIn) / 2
    ) {
      event.cartridgeEjected = moveSlide(state, spec, 1, now).cartridgeEjected
    }
    if (state.reload === 'magazine-out' && age >= magazineOut) {
      event.droppedMagazine = state.magazineEntity ?? undefined
      state.detachedMagazine = state.reloadAction ? state.magazineEntity : null
      state.magazineEntity = null
      state.magazineSeated = false
      state.reload = state.reloadAction ? 'none' : 'magazine-in'
      event.magazineDropped = true
    }
    if (state.reload === 'magazine-in' && age >= magazineIn) {
      state.magazineEntity = state.pendingMagazine
      state.pendingMagazine = null
      state.magazineSeated = true
      event.magazineSeated = true
      // A chambered round is kept: the slide is only run when the chamber is empty.
      state.reload =
        state.reloadAction || state.stopAfterInsertion || state.chamber > 0
          ? 'none'
          : 'slide-release'
      state.stopAfterInsertion = false
    }
    if (state.reload === 'slide-release' && age >= slideRelease) {
      state.slideLocked = false
      if (state.reloadAction) state.manualRackBack = false
      state.manualSlideTravel = undefined
      if (state.chamber === 0 && state.magazineSeated && state.magazine > 0) {
        state.magazine -= 1
        state.chamber = 1
      }
      state.reload = 'none'
      state.slideReleaseMs = now
      event.slideReleased = true
    }
  }
  const shot = now - state.lastShotMs
  const released = now - state.slideReleaseMs
  const half = spec.cycleMs / 2
  if (state.slideLocked) state.slide = shot < half ? Math.min(1, shot / half) : 1
  else if (shot >= 0 && shot < spec.cycleMs) state.slide = Math.sin((Math.PI * shot) / spec.cycleMs)
  else if (released >= 0 && released < half) state.slide = 1 - released / half
  else state.slide = 0
  if (state.reload === 'slide-release' && state.reloadAction) {
    const span = Math.max(1, spec.reloadMs.slideRelease - spec.reloadMs.magazineIn)
    const progress = Math.max(
      0,
      Math.min(1, (now - state.reloadStartMs - spec.reloadMs.magazineIn) / span),
    )
    state.slide = state.slideLocked ? 1 : Math.min(1, progress * 2)
  }
  if (state.manualSlideTravel !== undefined && state.reload !== 'slide-release')
    state.slide = state.manualSlideTravel
  return event
}

/** Rounds on board: the chamber plus the seated magazine. */
export function rounds(state: FirearmState): number {
  return state.chamber + (state.magazineSeated ? state.magazine : 0)
}

const empty = (): FirearmEvent => ({
  fired: false,
  locked: false,
  reloadStarted: false,
  magazineDropped: false,
  magazineSeated: false,
  slideReleased: false,
  dry: false,
})
