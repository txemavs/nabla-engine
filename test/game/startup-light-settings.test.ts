import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { restoreStartupLightSettings } from '../../game/startup-light-settings.js'

describe('startup flashlight shadow layout', () => {
  it('restores opt-in and defaults to no shadows for missing or inaccessible storage', () => {
    const runtime = { setHeadlampShadows: vi.fn() }
    for (const value of ['true', 'false', null]) {
      restoreStartupLightSettings(runtime, { getItem: () => value })
      expect(runtime.setHeadlampShadows).toHaveBeenLastCalledWith(value === 'true')
    }
    restoreStartupLightSettings(runtime, {
      getItem: () => {
        throw new Error('denied')
      },
    })
    expect(runtime.setHeadlampShadows).toHaveBeenLastCalledWith(false)
  })

  it.each(['terrain-main.ts', 'drive.ts'])(
    'restores before play and HUD mounting in %s',
    (file) => {
      const source = readFileSync(new URL(`../../game/${file}`, import.meta.url), 'utf8')
      const restore = source.indexOf('restoreStartupLightSettings(runtime)')
      expect(restore).toBeGreaterThan(0)
      expect(restore).toBeLessThan(source.indexOf('await startGame('))
      expect(source.indexOf('await startGame(')).toBeLessThan(
        source.indexOf('mountSettingsHud(runtime)'),
      )
    },
  )
})
