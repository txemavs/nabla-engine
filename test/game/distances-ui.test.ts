import { describe, expect, it } from 'vitest'
import { visibilityChoices } from '../../src/config/performance.js'
import { distanceRows, km } from '../../game/distances-ui.js'

describe('distance rows', () => {
  it('write distances in kilometres from 1000 m and in metres below', () => {
    expect(km(500)).toBe('500 m')
    expect(km(1000)).toBe('1 km')
    expect(km(16000)).toBe('16 km')
  })

  it('cover each live visibility setting once, with a label for every supported value', () => {
    expect(distanceRows.map((row) => row.field).sort()).toEqual(
      Object.keys(visibilityChoices).sort(),
    )
    for (const row of distanceRows)
      for (const value of visibilityChoices[row.field] as readonly number[])
        expect(row.format(value).length).toBeGreaterThan(0)
    const roads = distanceRows.find((row) => row.field === 'roads')!
    expect(roads.format(0)).toBe('Ocultas')
    expect(roads.format(2000)).toBe('2 km')
    expect(distanceRows.find((row) => row.field === 'relief')!.format(2)).toBe('5×5 celdas')
  })
})
