import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import type { LoadingScreen } from '../../game/loading.js'
import { readBootConfig, startGame } from '../../game/boot.js'
import { setPageQuery } from '../../game/page-query.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('nabla.pageQuery')]
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('nabla.bootTrace')]
})

describe('shared branded game startup', () => {
  it.each(['Nabla', 'Euskadi Online'])(
    'uses the same lifecycle for %s while the probe is pending',
    async (title) => {
      vi.spyOn(console, 'info').mockImplementation(() => {})
      vi.stubGlobal('document', { getElementById: () => null })
      setPageQuery({ search: () => '?scale=auto' })
      const calls: string[] = []
      let finishProbe!: (value: never) => void
      const probe = new Promise<never>((resolve) => {
        finishProbe = resolve
      })
      const runtime = {
        startAttract: vi.fn(() => calls.push('attract')),
        probeMachine: vi.fn(() => {
          calls.push('probe')
          return probe
        }),
        play: vi.fn(async () => {
          calls.push('play')
        }),
      }
      const loading = { setPhase: vi.fn() }
      const config = readBootConfig('', { NABLA_BOOT: { attract: true, splash: { title } } })
      await startGame(
        runtime as unknown as GameRuntime,
        loading as unknown as LoadingScreen,
        config,
        { playerMode: 'walk' },
        async () => {
          calls.push('prepare world')
        },
      )
      expect(calls).toEqual(['attract', 'probe', 'prepare world', 'play'])
      expect(runtime.play).toHaveBeenCalledExactlyOnceWith({ playerMode: 'walk' })
      expect(runtime.probeMachine).toHaveBeenCalledTimes(1)
      finishProbe(undefined as never)
      await probe
    },
  )

  it('does not start play if world preparation fails', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubGlobal('document', { getElementById: () => null })
    const runtime = { play: vi.fn() }
    await expect(
      startGame(
        runtime as unknown as GameRuntime,
        {} as LoadingScreen,
        { probe: false },
        {},
        async () => {
          throw new Error('invalid GLB')
        },
      ),
    ).rejects.toThrow('invalid GLB')
    expect(runtime.play).not.toHaveBeenCalled()
  })
})
