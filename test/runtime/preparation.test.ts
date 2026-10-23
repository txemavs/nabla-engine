import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimePreparation, type RuntimePreparationHooks } from '../../src/runtime/preparation.js'

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture() {
  const log: string[] = []
  const canvas = { dataset: {} as DOMStringMap }
  const context = { simulation: 'original' }
  const hooks: RuntimePreparationHooks<typeof context> = {
    prepareAudio: () => {
      log.push('audio')
    },
    vehiclesReady: async () => {
      log.push('vehicles')
    },
    loadWeaponAssets: async () => {
      log.push('assets')
    },
    ensureSidearm: () => {
      log.push('sidearm')
    },
    warmSidearm: async () => {
      log.push('weapon')
    },
    prepareWeaponPools: () => {
      log.push('pools')
    },
    prepareTerrain: async () => {
      log.push('terrain')
      return context
    },
    placeInitialPickup: async (value) => {
      expect(value).toBe(context)
      log.push('pickup')
    },
    freezeAttract: () => {
      log.push('freeze')
    },
    warmPresentation: async (value, signal) => {
      expect(value).toBe(context)
      log.push('gpu')
      owner.stage('preload', 4)
      signal.throwIfAborted()
    },
  }
  const published: string[] = []
  const owner = new RuntimePreparation(
    canvas,
    hooks,
    () => {
      published.push(canvas.dataset.loadingDetail!)
      return true
    },
    async () => {},
  )
  return { owner, hooks, canvas, log, published }
}

it('preserves host work, resource order, context and final holding progress', async () => {
  const f = fixture()
  f.owner.beforeReveal(async () => {
    f.log.push('host')
  })
  await f.owner.prepare(new AbortController().signal)
  expect(f.log).toEqual([
    'audio',
    'vehicles',
    'assets',
    'sidearm',
    'weapon',
    'pools',
    'host',
    'terrain',
    'pickup',
    'freeze',
    'gpu',
  ])
  expect(f.canvas.dataset).toMatchObject({
    reveal: 'holding',
    revealStage: 'ready',
    loadingStage: 'ready',
    revealProgress: '1.00',
  })
  expect(f.published.length).toBeGreaterThan(0)
  expect(JSON.parse(f.canvas.dataset.bootTimings!)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ phase: expect.any(String), ms: expect.any(Number) }),
    ]),
  )
  f.owner.finishDetail()
})

it('waits for preparation authorization and treats rejected gates as settled', async () => {
  const f = fixture(),
    gate = deferred()
  f.owner.holdPreparation(gate.promise)
  f.owner.holdReveal(Promise.reject(new Error('intro skipped')))
  const run = f.owner.prepare(new AbortController().signal)
  expect(f.log).toEqual([])
  gate.reject(new Error('authorization settled'))
  await run
  expect(f.canvas.dataset.reveal).toBe('holding')
})

it('aborts a pending preparation gate and can prepare again without late work', async () => {
  const f = fixture(),
    gate = deferred(),
    controller = new AbortController()
  f.owner.holdPreparation(gate.promise)
  const run = f.owner.prepare(controller.signal)
  const error = new Error('stopped')
  controller.abort(error)
  await expect(run).rejects.toBe(error)
  expect(f.log).toEqual([])
  await f.owner.prepare(new AbortController().signal)
  const completed = [...f.log]
  gate.resolve()
  await Promise.resolve()
  expect(f.log).toEqual(completed)
})

it('does not advance past models when stopped during their load', async () => {
  const f = fixture(),
    ready = deferred(),
    controller = new AbortController()
  f.hooks.vehiclesReady = () => ready.promise
  const run = f.owner.prepare(controller.signal)
  await vi.waitFor(() => expect(f.canvas.dataset.revealStage).toBe('vehicles'))
  controller.abort(new Error('disposed'))
  ready.resolve()
  await expect(run).rejects.toThrow('disposed')
  expect(f.log).toEqual(['audio'])
  expect(f.canvas.dataset.reveal).toBe('preparing')
})

it('logs rejected host tasks and preserves snapshot queue consumption', async () => {
  const f = fixture(),
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  f.owner.beforeReveal(async () => {
    f.owner.beforeReveal(async () => {
      f.log.push('next-run')
    })
    throw new Error('optional content')
  })
  await f.owner.prepare(new AbortController().signal)
  expect(warn).toHaveBeenCalledOnce()
  expect(f.log).not.toContain('next-run')
  await f.owner.prepare(new AbortController().signal)
  expect(f.log.filter((value) => value === 'next-run')).toHaveLength(1)
})

it('propagates missing terrain and permits retry without publishing ready', async () => {
  const f = fixture()
  const terrain = f.hooks.prepareTerrain
  f.hooks.prepareTerrain = async () => {
    throw new Error('missing terrain')
  }
  await expect(f.owner.prepare(new AbortController().signal)).rejects.toThrow('missing terrain')
  expect(f.log).not.toContain('gpu')
  expect(f.canvas.dataset.revealStage).toBe('terrain')
  f.hooks.prepareTerrain = terrain
  await f.owner.prepare(new AbortController().signal)
  expect(f.canvas.dataset.revealStage).toBe('ready')
})

it('drains reveal gates added while holding and keeps two owners independent', async () => {
  const a = fixture(),
    b = fixture(),
    first = deferred(),
    second = deferred()
  a.owner.holdReveal(first.promise)
  let done = false
  const run = a.owner.prepare(new AbortController().signal).then(() => {
    done = true
  })
  await vi.waitFor(() => expect(a.canvas.dataset.reveal).toBe('holding'))
  await b.owner.prepare(new AbortController().signal)
  expect(done).toBe(false)
  a.owner.holdReveal(second.promise)
  first.resolve()
  await Promise.resolve()
  expect(done).toBe(false)
  second.resolve()
  await run
  expect(done).toBe(true)
})

it('retains the final host-gate settlement contract after cancellation; caller guards reveal', async () => {
  const f = fixture(),
    gate = deferred(),
    controller = new AbortController()
  f.owner.holdReveal(gate.promise)
  let revealed = false
  const run = (async () => {
    await f.owner.prepare(controller.signal)
    controller.signal.throwIfAborted()
    revealed = true
  })()
  await vi.waitFor(() => expect(f.canvas.dataset.reveal).toBe('holding'))
  controller.abort(new Error('disposed'))
  gate.resolve()
  await expect(run).rejects.toThrow('disposed')
  expect(revealed).toBe(false)
})
