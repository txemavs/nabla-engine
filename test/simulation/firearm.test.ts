/**
 * The USP Compact as a firearm: 13 + 1, one shot per trigger press, slide lock on the empty
 * magazine, a reload in three steps, and a tactical reload that keeps the chambered round.
 */
import { expect, it } from 'vitest'
import { weaponPreset } from '../../src/catalog/weapons/library.js'
import {
  advanceFirearm,
  beginReload,
  freshFirearm,
  rounds,
  trigger,
  type FirearmSpec,
  type FirearmState,
} from '../../src/simulation/weapons/firearm.js'

const spec = (): FirearmSpec => {
  const firearm = weaponPreset('hk-compact').firearm!
  return {
    magazineCapacity: firearm.magazineCapacity,
    chamber: firearm.chamber,
    cycleMs: firearm.cycleMs,
    reloadMs: firearm.reloadMs,
  }
}

/** Hold the trigger, advance, release, advance: one shot, then the slide back in battery. */
function shot(state: FirearmState, firearm: FirearmSpec, at: number): ReturnType<typeof trigger> {
  const event = trigger(state, firearm, true, at)
  advanceFirearm(state, firearm, at)
  trigger(state, firearm, false, at)
  advanceFirearm(state, firearm, at + firearm.cycleMs)
  return event
}

it('starts at 13 + 1 and fires one round per trigger press', () => {
  const firearm = spec()
  expect(firearm.magazineCapacity).toBe(13)
  const state = freshFirearm(firearm)
  expect(rounds(state)).toBe(14)
  expect(shot(state, firearm, 0).fired).toBe(true)
  expect(state.magazine).toBe(12)
  expect(state.chamber).toBe(1)
  // Still held: the trigger has to reset, so no second shot.
  expect(trigger(state, firearm, true, 50).fired).toBe(false)
  trigger(state, firearm, false, 50)
  expect(shot(state, firearm, 1000).fired).toBe(true)
  expect(rounds(state)).toBe(12)
})

it('locks the slide back on the empty magazine and clicks when empty', () => {
  const firearm = spec()
  const state = freshFirearm(firearm)
  state.magazine = 0
  const event = trigger(state, firearm, true, 0)
  expect(event.fired).toBe(true)
  expect(event.locked).toBe(true)
  expect(state.slideLocked).toBe(true)
  advanceFirearm(state, firearm, firearm.cycleMs)
  expect(state.slide).toBe(1)
  expect(rounds(state)).toBe(0)
  trigger(state, firearm, false, 500)
  trigger(state, firearm, false, 500)
  const dry = trigger(state, firearm, true, 1000)
  expect(dry.fired).toBe(false)
  expect(dry.dry).toBe(true)
})

it('reloads in three steps and keeps a chambered round on a tactical reload', () => {
  const firearm = spec()
  const { magazineOut, magazineIn } = firearm.reloadMs
  const state = freshFirearm(firearm)
  state.magazine = 4
  const reload = beginReload(state, firearm, 0)
  expect(reload.reloadStarted).toBe(true)
  // A second request while reloading does nothing.
  expect(beginReload(state, firearm, 1).reloadStarted).toBe(false)
  expect(advanceFirearm(state, firearm, magazineOut).magazineDropped).toBe(true)
  expect(state.magazineSeated).toBe(false)
  expect(state.chamber).toBe(1)
  const seated = advanceFirearm(state, firearm, magazineIn)
  expect(seated.magazineSeated).toBe(true)
  // The slide was never locked, so the chambered round stays and the new magazine is full.
  expect(state.reload).toBe('none')
  expect(state.chamber).toBe(1)
  expect(state.magazine).toBe(13)
  expect(rounds(state)).toBe(14)
  // Nothing left to do.
  expect(beginReload(state, firearm, 10000).reloadStarted).toBe(false)
})

it('runs the slide forward after a slide-lock reload, feeding one round', () => {
  const firearm = spec()
  const { magazineIn, slideRelease } = firearm.reloadMs
  const state = freshFirearm(firearm)
  state.magazine = 0
  shot(state, firearm, 0)
  expect(state.slideLocked).toBe(true)
  beginReload(state, firearm, 1000)
  advanceFirearm(state, firearm, 1000 + magazineIn)
  expect(state.reload).toBe('slide-release')
  expect(state.chamber).toBe(0)
  const released = advanceFirearm(state, firearm, 1000 + slideRelease)
  expect(released.slideReleased).toBe(true)
  expect(state.slideLocked).toBe(false)
  expect(state.chamber).toBe(1)
  expect(state.magazine).toBe(12)
  expect(state.slide).toBe(1) // just released: still back, moving forward
  advanceFirearm(state, firearm, 1000 + slideRelease + firearm.cycleMs)
  expect(state.slide).toBe(0)
})

it('fires the chambered round with the magazine out (no magazine disconnect)', () => {
  const firearm = spec()
  const state = freshFirearm(firearm)
  state.magazineSeated = false
  state.magazine = 0
  const shot_ = shot(state, firearm, 0)
  expect(shot_.fired).toBe(true)
  expect(shot_.locked).toBe(false)
  expect(state.chamber).toBe(0)
  expect(state.slide).toBe(0)
})
