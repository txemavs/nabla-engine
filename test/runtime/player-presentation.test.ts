import { expect, it, vi } from 'vitest'
import { Group, Vector3 } from 'three'
import { RuntimePlayerPresentation } from '../../src/runtime/player-presentation.js'
import { createSettingsStore } from '../../src/runtime/settings-scope.js'
import type { PlayerBody, PlayerBodyRig } from '../../src/render/entity/player-body.js'
import type { HeldWeapon } from '../../src/runtime/held-weapon.js'
import type { HeldWeaponPreset } from '../../src/catalog/weapons/held-library.js'
import type { Sidearm } from '../../src/runtime/sidearm.js'
import { weaponSlots } from '../../src/catalog/weapons/slots.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const rig = () => ({ create: vi.fn(() => ({ root: new Group() }) as PlayerBody) })
const held = (preset: HeldWeaponPreset) => ({
  preset,
  ready: Promise.resolve(),
  dispose: vi.fn(),
  worldObject: new Group(),
})
function fixture(namespace = 'test', values = new Map<string, string>()) {
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v)
    },
    removeItem: (k: string) => {
      values.delete(k)
    },
  }
  const body = { setHolstered: vi.fn(), holdAtHand: vi.fn() }
  const hooks = {
    applyBody: vi.fn(),
    currentBody: () => body as unknown as PlayerBody,
    actorHands: vi.fn(),
    createSidearm: vi.fn(() => null as unknown as Sidearm),
    rememberArrow: vi.fn(),
    sceneOrigin: () => new Vector3(2, 0, 0),
    onError: vi.fn(),
  }
  const factories = {
    loadRig: vi.fn(async () => rig() as unknown as PlayerBodyRig),
    createHeld: vi.fn((preset: HeldWeaponPreset) => held(preset) as unknown as HeldWeapon),
  }
  const owner = new RuntimePlayerPresentation(
    createSettingsStore({ mode: 'pc', namespace, storage }),
    hooks,
    factories,
  )
  return { owner, hooks, factories, body, values }
}
const preset = (id: string) => ({ id }) as HeldWeaponPreset

it('only installs the latest body and never creates the superseded instance', async () => {
  const f = fixture(),
    first = deferred<PlayerBodyRig>(),
    second = deferred<PlayerBodyRig>()
  f.factories.loadRig.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const a = f.owner.setPlayerBody({ model: 'a', animations: 'animations' }),
    b = f.owner.setPlayerBody({ model: 'b', animations: 'animations' })
  const ra = rig(),
    rb = rig()
  second.resolve(rb as unknown as PlayerBodyRig)
  expect(await b).toBe(rb)
  first.resolve(ra as unknown as PlayerBodyRig)
  expect(await a).toBeNull()
  expect(ra.create).not.toHaveBeenCalled()
  expect(f.hooks.applyBody).toHaveBeenCalledExactlyOnceWith(rb.create.mock.results[0].value)
})

it('a head-only host choice wins over the pending default and saves actor changes without loading', async () => {
  const f = fixture(),
    pending = deferred<PlayerBodyRig>(),
    late = rig()
  f.factories.loadRig.mockReturnValueOnce(pending.promise)
  f.owner.ensureDefault()
  await f.owner.setPlayerBody(null)
  pending.resolve(late as unknown as PlayerBodyRig)
  await Promise.resolve()
  expect(late.create).not.toHaveBeenCalled()
  expect(f.owner.selectable).toBe(false)
  expect(await f.owner.setActor({ kind: 'polibot', color: 'blue' })).toBeNull()
  f.owner.ensureDefault()
  expect(f.factories.loadRig).toHaveBeenCalledOnce()
  expect(f.hooks.actorHands).not.toHaveBeenCalled()
  expect(f.owner.profile).toBe('polibot:blue')
})

it('invalidates pending body loads on disposal without disposing shared rigs', async () => {
  const f = fixture(),
    pending = deferred<PlayerBodyRig>(),
    late = rig()
  f.factories.loadRig.mockReturnValueOnce(pending.promise)
  const loading = f.owner.setPlayerBody({ model: 'late', animations: 'animations' })
  f.owner.dispose()
  pending.resolve(late as unknown as PlayerBodyRig)
  expect(await loading).toBeNull()
  expect(f.hooks.applyBody).not.toHaveBeenCalled()
  expect(late.create).not.toHaveBeenCalled()
})

it('retains the installed body on load failure and permits retry', async () => {
  const f = fixture()
  const first = await f.owner.setPlayerBody({ model: 'first', animations: 'animations' })
  f.factories.loadRig.mockRejectedValueOnce(new Error('asset missing'))
  await expect(
    f.owner.setPlayerBody({ model: 'missing', animations: 'animations' }),
  ).rejects.toThrow('asset missing')
  expect(f.owner.bodyRig).toBe(first)
  const next = await f.owner.setPlayerBody({ model: 'retry', animations: 'animations' })
  expect(f.owner.bodyRig).toBe(next)
})

it('shares remote rigs by profile and evicts a failed load for retry', async () => {
  const f = fixture(),
    pending = deferred<PlayerBodyRig>()
  f.factories.loadRig.mockReturnValueOnce(pending.promise)
  const first = f.owner.actorRig('default:red')
  expect(f.owner.actorRig('default:red')).toBe(first)
  pending.reject(new Error('missing rig'))
  await expect(first).rejects.toThrow('missing rig')
  await f.owner.actorRig('default:red')
  expect(f.factories.loadRig).toHaveBeenCalledTimes(2)
  expect(f.hooks.applyBody).not.toHaveBeenCalled()
})

it('keeps stored actor choices and live state independent across instances', async () => {
  const values = new Map([['nabla.actor', 'default:red']])
  const a = fixture('left', values),
    b = fixture('right', values)
  expect(a.owner.actor.color).toBe('red')
  expect(b.owner.actor.color).toBe('red')
  const choice = { kind: 'polibot', color: 'blue' } as const
  await a.owner.setActor(choice)
  expect(a.hooks.actorHands).toHaveBeenCalledExactlyOnceWith(choice)
  expect(b.owner.actor.color).toBe('red')
  expect(fixture('left', values).owner.actor).toEqual(choice)
  expect(fixture('right', values).owner.actor.color).toBe('red')
})

it('reuses the held model, disposes replaced models and reports load errors', async () => {
  const f = fixture(),
    pending = deferred<void>()
  const first = { ...held(preset('first')), ready: pending.promise }
  f.factories.createHeld.mockReturnValueOnce(first as unknown as HeldWeapon)
  f.owner.selectHeld(preset('first'))
  f.owner.selectHeld(preset('first'))
  expect(f.factories.createHeld).toHaveBeenCalledOnce()
  f.owner.selectHeld(preset('second'))
  expect(first.dispose).toHaveBeenCalledOnce()
  const second = f.owner.heldWeapon!
  pending.reject(new Error('old load failed'))
  await Promise.resolve()
  expect(f.hooks.onError).toHaveBeenCalledOnce()
  expect(f.owner.heldWeapon).toBe(second)
  f.owner.clearHeld()
  f.owner.dispose()
  expect(second.dispose).toHaveBeenCalledOnce()
})

it('attaches only visible held objects and preserves explicit holster overrides', () => {
  const f = fixture(),
    firearm = new Group()
  f.owner.selectHeld(preset('held'))
  f.owner.heldDrawn = true
  f.owner.weaponsToHand(false, firearm, null)
  expect(f.body.setHolstered).toHaveBeenLastCalledWith(false)
  expect(f.body.holdAtHand).toHaveBeenCalledWith(f.owner.heldWeapon!.worldObject, true)
  f.owner.heldWeapon!.worldObject!.visible = false
  firearm.visible = false
  f.body.holdAtHand.mockClear()
  f.owner.weaponsToHand(false, firearm, true)
  expect(f.body.setHolstered).toHaveBeenLastCalledWith(true)
  expect(f.body.holdAtHand).not.toHaveBeenCalled()
})

function firearmFixture() {
  const f = fixture(),
    ready = deferred<void>()
  const weapon = {
    ready: ready.promise,
    visible: false,
    dispose: vi.fn(),
    worldObject: new Group(),
    syncWorld: vi.fn(),
    worldMuzzle: () => new Vector3(5, 1, 0),
  }
  f.hooks.createSidearm.mockReturnValue(weapon as unknown as Sidearm)
  const slot = weaponSlots().find((entry) => entry.kind === 'firearm')!.slot
  return { ...f, weapon, ready, slot }
}

it('returns caller-owned props with the existing muzzle, socket and cleanup behavior', async () => {
  const f = firearmFixture(),
    loading = f.owner.createWeaponProp(f.slot, f.body as unknown as PlayerBody)
  f.ready.resolve()
  const prop = (await loading)!
  expect(prop.muzzle()).toEqual([3, 1, 0])
  prop.update(100)
  expect(f.weapon.syncWorld).toHaveBeenCalledWith(prop.root.children[0], 100, false)
  expect(f.body.holdAtHand).toHaveBeenCalledWith(f.weapon.worldObject)
  f.owner.dispose()
  expect(f.weapon.dispose).not.toHaveBeenCalled()
  prop.dispose()
  expect(f.weapon.dispose).toHaveBeenCalledOnce()
  expect(f.body.setHolstered).toHaveBeenLastCalledWith(true)
})

it('does not attach grip props to a body socket', async () => {
  const f = firearmFixture(),
    loading = f.owner.createWeaponProp(f.slot, f.body as unknown as PlayerBody, { grip: true })
  f.ready.resolve()
  const prop = (await loading)!
  expect(prop.root.children[0].position.toArray()).toEqual([-0.24, 0.16, 0.32])
  prop.update()
  prop.dispose()
  expect(f.body.holdAtHand).not.toHaveBeenCalled()
  expect(f.body.setHolstered).not.toHaveBeenCalled()
})

it('cleans up a prop that finishes after disposal instead of returning it', async () => {
  const f = firearmFixture(),
    loading = f.owner.createWeaponProp(f.slot)
  f.owner.dispose()
  f.ready.resolve()
  expect(await loading).toBeNull()
  expect(f.weapon.dispose).toHaveBeenCalledOnce()
  expect(f.weapon.visible).toBe(false)
})

it('cleans up a failed prop and preserves the rejection', async () => {
  const f = firearmFixture(),
    loading = f.owner.createWeaponProp(f.slot)
  f.ready.reject(new Error('prop failed'))
  await expect(loading).rejects.toThrow('prop failed')
  expect(f.weapon.dispose).toHaveBeenCalledOnce()
})
