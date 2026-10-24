import { expect, it } from 'vitest'
import { matchingSettings } from '../../game/settings-search.js'
import { layoutSectionTabs, MENU_LAYOUT } from '../../game/menu-layout.js'

it('finds translated labels without accents or case and requires all search words', () => {
  const entries = [
    {
      id: 'moon',
      title: 'Astros',
      path: 'Mundo → Entorno',
      text: 'Luna Ampliación en el horizonte',
    },
    { id: 'light', title: 'Iluminación', path: 'Desarrollo', text: 'Intensidad' },
  ]
  expect(matchingSettings(entries, 'LUNA ampliacion')).toEqual([entries[0]])
  expect(matchingSettings(entries, 'desarrollo iluminacion')).toEqual([entries[1]])
  expect(matchingSettings(entries, 'luna sonido')).toEqual([])
  expect(matchingSettings(entries, '  ')).toEqual([])
})

it('places every built-in section once, keeping graphics, simulation and developer tools separate', () => {
  const entries = layoutSectionTabs(),
    ids = entries.map(([id]) => id)
  expect(new Set(ids).size).toBe(ids.length)
  const tabs = new Map(entries)
  expect(tabs.get('settings-layer-celestial')).toBe('planet')
  expect(tabs.get('settings-planet-air')).toBe('planet')
  expect(tabs.get('settings-weapon')).toBe('options')
  expect(tabs.get('settings-combat')).toBe('options')
  expect(tabs.get('terrain-cache')).toBe('options')
  const video = MENU_LAYOUT.options.find((item) => typeof item !== 'string' && item.id === 'video')
  expect(video).toMatchObject({
    sections: expect.arrayContaining([
      'settings-video-shadows',
      'settings-light',
      'settings-distances',
    ]),
  })
})
