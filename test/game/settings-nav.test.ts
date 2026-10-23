import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { navIssues, sectionMerges } from '../../game/settings-nav.js'
import { catalogGaps, ENGINE_CATALOGS } from '../../src/i18n/index.js'

const SETTINGS_SOURCES = [
  'game/menu.ts',
  'game/settings-hud.ts',
  'game/settings-controls.ts',
  'game/gravity-ui.ts',
  'game/recover-road-ui.ts',
  'game/sound-ui.ts',
  'game/flip-cinematic-ui.ts',
  'game/fsr-settings.ts',
  'game/display-settings.ts',
  'game/shadow-bias-ui.ts',
  'game/distances-ui.ts',
  'game/anisotropy-ui.ts',
  'src/runtime/action-cam-settings.ts',
  'src/config/input-bindings.ts',
  'src/runtime/usb/wizard-panel.ts',
  'src/runtime/usb/settings-panel.ts',
  'src/runtime/usb/wizard.ts',
  'src/runtime/usb/controllers.ts',
]
const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('settings navigation', () => {
  it('merges same-title sections within a group, not across groups', () => {
    const merges = sectionMerges([
      { id: 'a', title: 'Driving', group: 'driving' },
      { id: 'b', title: 'driving ', group: 'driving' },
      { id: 'c', title: 'Driving', group: 'other' },
    ])
    expect([...merges]).toEqual([['a', ['b']]])
  })

  it('reports duplicate and empty titles', () => {
    expect(
      navIssues([
        { id: 'a', title: 'X', group: 'g' },
        { id: 'a', title: 'X', group: 'g' },
        { id: 'e', title: ' ' },
      ]),
    ).toEqual(['duplicate title in group: a ← a', 'empty title: e'])
  })
})

describe('settings translations', () => {
  it('has every catalog key in en, es and eu', () => {
    expect(catalogGaps(ENGINE_CATALOGS)).toEqual([])
  })

  it('has a catalog entry for every t() key used by the settings UI', () => {
    const missing: string[] = []
    for (const f of SETTINGS_SOURCES)
      for (const m of read(f).matchAll(/\bt\(\s*'([^'$]+)'/g))
        for (const loc of ['en', 'es', 'eu'] as const)
          if (!Object.hasOwn(ENGINE_CATALOGS[loc], m[1])) missing.push(`${loc}: ${m[1]} (${f})`)
    expect(missing).toEqual([])
  })

  it('keeps no untranslated Spanish string literals in the settings UI', () => {
    const found: string[] = []
    for (const f of SETTINGS_SOURCES)
      for (const m of code(read(f)).matchAll(/(['`])((?:(?!\1)[^\n\\])*[áéíóúñÁÉÍÓÚÑ¿¡](?:(?!\1)[^\n\\])*)\1/g))
        found.push(`${f}: ${m[2]}`)
    expect(found).toEqual([])
  })
})
