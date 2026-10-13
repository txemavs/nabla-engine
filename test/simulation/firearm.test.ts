/**
 * The USP Compact as a firearm: 13 + 1, one shot per trigger press, slide lock on the empty
 * magazine, a reload in three steps, and a tactical reload that keeps the chambered round.
 */
import { expect, it } from 'vitest'
import { weaponPreset } from '../../src/catalog/weapons/library.js'
import {
  advanceFirearm,
  beginReload,
  beginReloadAction,
  moveSlide,
  insertFreshMagazine,
  swapFreshMagazine,
  releaseSlide,
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

it('holds a manual rack rearward until release, ejecting once and feeding only on release', () => {
  const firearm = spec()
  const state = freshFirearm(firearm)
  const magazine = state.magazine
  state.manualRackHeld = true
  beginReloadAction(state, firearm, 'slide-release', 1000)
  expect(advanceFirearm(state, firearm, 2000).cartridgeEjected).toBe(true)
  expect(state.slide).toBe(1)
  expect(state.chamber).toBe(0)
  expect(state.magazine).toBe(magazine)
  expect(advanceFirearm(state, firearm, 2500).cartridgeEjected).toBeFalsy()
  expect(state.slide).toBe(1)
  expect(trigger(state, firearm, true, 2501).fired).toBe(false)
  state.manualRackHeld = false
  expect(advanceFirearm(state, firearm, 10000).slideReleased).toBe(true)
  expect(state.chamber).toBe(1)
  expect(state.magazine).toBe(magazine - 1)
})

it('latches a held rearward slide after two seconds and feeds only when explicitly released', () => {
  const firearm = spec(),
    state = freshFirearm(firearm)
  const magazine = state.magazine
  state.manualRackHeld = true
  beginReloadAction(state, firearm, 'slide-release', 1000)
  advanceFirearm(state, firearm, 2000)
  expect(advanceFirearm(state, firearm, 3000).manualSlideLocked).toBeFalsy()
  expect(advanceFirearm(state, firearm, 3001).manualSlideLocked).toBe(true)
  expect(state.slideLocked).toBe(true)
  expect(state.slide).toBe(1)
  state.manualRackHeld = false
  expect(advanceFirearm(state, firearm, 6000).manualSlideLocked).toBeFalsy()
  expect(state.slide).toBe(1)
  expect(state.chamber).toBe(0)
  expect(state.magazine).toBe(magazine)
  expect(releaseSlide(state, 6100).slideReleased).toBe(true)
  expect(state.chamber).toBe(1)
  expect(state.magazine).toBe(magazine - 1)
  advanceFirearm(state, firearm, 7000)
  expect(state.slide).toBe(0)
})

it('R removes, T supplies unlimited distinct full items, and Y alone releases the catch', () => {
  const firearm = spec(),
    state = freshFirearm(firearm)
  state.spareMagazines.length = 0
  const ids = new Set<string>()
  for (let i = 0; i < 6; i++) {
    state.magazine = 0
    state.chamber = 0
    state.slideLocked = true
    const now = i * 10000
    beginReloadAction(state, firearm, 'magazine-out', now)
    const removed = advanceFirearm(state, firearm, now + 1000).droppedMagazine!
    expect(removed.rounds).toBe(0)
    insertFreshMagazine(state, firearm, now + 2000)
    advanceFirearm(state, firearm, now + 4000)
    expect(state.magazine).toBe(13)
    expect(state.chamber).toBe(0)
    expect(state.slideLocked).toBe(true)
    ids.add(state.magazineEntity!.id)
    expect(releaseSlide(state, now + 5000).slideReleased).toBe(true)
    expect(state.magazine).toBe(12)
    expect(state.chamber).toBe(1)
    expect(releaseSlide(state, now + 6000).slideReleased).toBe(false)
  }
  expect(ids.size).toBe(6)
})

it('M swaps for a full extended item without refilling the discarded magazine or closing the slide', () => {
  const firearm = { ...spec(), magazineCapacity: 30 },
    state = freshFirearm(spec())
  state.magazine = 2
  state.chamber = 0
  state.slideLocked = true
  const old = state.magazineEntity
  swapFreshMagazine(state, firearm, 0)
  expect(advanceFirearm(state, firearm, 1000).droppedMagazine).toBe(old)
  advanceFirearm(state, firearm, 4000)
  expect(old!.rounds).toBe(2)
  expect(state.magazineEntity!.capacity).toBe(30)
  expect(state.magazine).toBe(30)
  expect(state.slideLocked).toBe(true)
  expect(state.reload).toBe('none')
})

it('transfers magazine entities without refilling the removed item', () => {
  const firearm = spec(),
    state = freshFirearm(firearm)
  state.magazine = 4
  const original = state.magazineEntity!
  const replacement = state.spareMagazines[0]
  replacement.rounds = 2
  beginReload(state, firearm, 0)
  const event = advanceFirearm(state, firearm, firearm.reloadMs.magazineOut)
  expect(event.droppedMagazine).toBe(original)
  expect(original.rounds).toBe(4)
  expect(state.magazineEntity).toBeNull()
  advanceFirearm(state, firearm, firearm.reloadMs.magazineIn)
  expect(state.magazineEntity).toBe(replacement)
  expect(state.magazine).toBe(2)
  shot(state, firearm, 10000)
  expect(replacement.rounds).toBe(1)
  expect(original.rounds).toBe(4)
  expect(new Set([original.id, replacement.id]).size).toBe(2)
})

it('manual removal and reinsertion keeps the same partially used magazine', () => {
  const firearm = spec(),
    state = freshFirearm(firearm)
  state.magazine = 3
  const original = state.magazineEntity
  beginReloadAction(state, firearm, 'magazine-out', 0)
  advanceFirearm(state, firearm, firearm.reloadMs.magazineOut)
  beginReloadAction(state, firearm, 'magazine-in', 10000)
  advanceFirearm(state, firearm, 10000 + firearm.reloadMs.magazineIn)
  expect(state.magazineEntity).toBe(original)
  expect(state.magazine).toBe(3)
})

it('does not manufacture a replacement after spare magazines are exhausted', () => {
  const firearm = spec(),
    state = freshFirearm(firearm)
  state.magazine = 0
  state.spareMagazines.length = 0
  expect(beginReload(state, firearm, 0).reloadStarted).toBe(false)
  expect(state.magazine).toBe(0)
})

it('independent magazine removal preserves the chamber and waits for insertion', () => {
  const firearm = spec()
  const state = freshFirearm(firearm)
  expect(beginReloadAction(state, firearm, 'magazine-out', 0).reloadStarted).toBe(true)
  const out = advanceFirearm(state, firearm, firearm.reloadMs.magazineOut)
  expect(out.magazineDropped).toBe(true)
  expect(state.chamber).toBe(1)
  advanceFirearm(state, firearm, 10000)
  expect(state.magazineSeated).toBe(false)
  expect(state.reload).toBe('none')
  expect(trigger(state, firearm, true, 10000).fired).toBe(true)
  expect(state.chamber).toBe(0)
})

it('insertion waits for a separate slide action before filling an empty chamber', () => {
  const firearm = spec()
  const state = freshFirearm(firearm)
  state.magazineSeated = false
  state.magazine = 0
  state.chamber = 0
  state.slideLocked = true
  beginReloadAction(state, firearm, 'magazine-in', 0)
  const inserted = advanceFirearm(state, firearm, firearm.reloadMs.magazineIn)
  expect(inserted.magazineSeated).toBe(true)
  expect(inserted.slideReleased).toBe(false)
  expect(state.chamber).toBe(0)
  expect(state.slideLocked).toBe(true)
  beginReloadAction(state, firearm, 'slide-release', 10000)
  const closed = advanceFirearm(state, firearm, 10000 + firearm.reloadMs.slideRelease)
  expect(closed.slideReleased).toBe(true)
  expect(state.chamber).toBe(1)
  expect(state.magazine).toBe(firearm.magazineCapacity - 1)
})

it('operating the slide without a magazine never creates ammunition', () => {
  const firearm = spec()
  const state = freshFirearm(firearm)
  state.magazineSeated = false
  state.magazine = 0
  beginReloadAction(state, firearm, 'slide-release', 0)
  advanceFirearm(state, firearm, firearm.reloadMs.slideRelease)
  expect(rounds(state)).toBe(0)
})

it('manual slide ejects once and feeds only when closed', () => {
  const firearm = spec(),
    state = freshFirearm(firearm)
  expect(moveSlide(state, firearm, 0.4, 0).cartridgeEjected).toBeFalsy()
  expect(state.chamber).toBe(1)
  expect(moveSlide(state, firearm, 0.9, 1).cartridgeEjected).toBe(true)
  expect(state.chamber).toBe(0)
  expect(moveSlide(state, firearm, 1, 2).cartridgeEjected).toBeFalsy()
  moveSlide(state, firearm, 0, 3)
  expect(state.chamber).toBe(1)
  expect(state.magazine).toBe(firearm.magazineCapacity - 1)
})

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

it('releases the catch with an empty magazine or no magazine without creating ammunition', () => {
  for (const seated of [true, false]) {
    const state = freshFirearm(spec())
    state.magazine = 0
    state.magazineSeated = seated
    state.chamber = 0
    state.slideLocked = true
    expect(releaseSlide(state, 1000).slideReleased).toBe(true)
    expect(state.slideLocked).toBe(false)
    expect(state.chamber).toBe(0)
    expect(state.magazine).toBe(0)
    expect(state.magazineSeated).toBe(seated)
  }
})
