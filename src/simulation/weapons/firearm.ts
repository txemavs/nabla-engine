/**
 * Firearm state for one sidearm, separate from its presentation. Semi-automatic: one shot per
 * trigger press, and only once the slide has returned to battery. The slide stays back on an
 * empty magazine. A reload drops the current magazine (its cartridges with it), seats a full one
 * and releases the slide; with a round already chambered the slide is not run, so the chambered
 * round is kept.
 */
export interface FirearmSpec {
  magazineCapacity: number
  chamber: number
  cycleMs: number
  reloadMs: { magazineOut: number; magazineIn: number; slideRelease: number }
}

export type ReloadPhase = 'none' | 'magazine-out' | 'magazine-in' | 'slide-release'

export interface FirearmState {
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
  /** The trigger is still held from the last press: it has to be released (reset) first. */
  triggerHeld: boolean
  lastShotMs: number
  /** When the slide was last released forward, ms. */
  slideReleaseMs: number
}

export interface FirearmEvent {
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
}

export function freshFirearm(spec: FirearmSpec): FirearmState {
  return {
    magazine: spec.magazineCapacity,
    magazineSeated: true,
    chamber: spec.chamber,
    slideLocked: false,
    slide: 0,
    reload: 'none',
    reloadStartMs: -Infinity,
    triggerHeld: false,
    lastShotMs: -Infinity,
    slideReleaseMs: -Infinity,
  }
}

/** A reload request at `now` (ms). Nothing when one is running or the pistol is full. */
export function beginReload(state: FirearmState, spec: FirearmSpec, now: number): FirearmEvent {
  const event = empty()
  if (state.reload !== 'none') return event
  if (
    state.magazineSeated &&
    state.magazine >= spec.magazineCapacity &&
    state.chamber >= spec.chamber
  )
    return event
  event.reloadStarted = true
  state.reload = 'magazine-out'
  state.reloadStartMs = now
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
  if (state.reload !== 'none' || now - state.lastShotMs < spec.cycleMs) return event
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
    const age = now - state.reloadStartMs
    const { magazineOut, magazineIn, slideRelease } = spec.reloadMs
    if (state.reload === 'magazine-out' && age >= magazineOut) {
      state.magazine = 0
      state.magazineSeated = false
      state.reload = 'magazine-in'
      event.magazineDropped = true
    }
    if (state.reload === 'magazine-in' && age >= magazineIn) {
      state.magazine = spec.magazineCapacity
      state.magazineSeated = true
      event.magazineSeated = true
      // A chambered round is kept: the slide is only run when the chamber is empty.
      state.reload = state.chamber > 0 ? 'none' : 'slide-release'
    }
    if (state.reload === 'slide-release' && age >= slideRelease) {
      state.slideLocked = false
      state.magazine -= 1
      state.chamber = 1
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
