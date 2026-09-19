import { describe, expect, it } from 'vitest'
import {
  parseHelmScreen,
  adjacentHelmScreen,
  hopHelmScreen,
  allHelmScreens,
  helmScreenIndex,
  helmScreenAt,
} from './helmScreen.js'

describe('helmScreen', () => {
  it('parseHelmScreen returns valid screen', () => {
    expect(parseHelmScreen('left')).toBe('left')
    expect(parseHelmScreen('center')).toBe('center')
    expect(parseHelmScreen('right')).toBe('right')
    expect(parseHelmScreen('invalid')).toBe('center')
    expect(parseHelmScreen(null)).toBe('center')
  })

  it('adjacentHelmScreen returns neighbour or null', () => {
    expect(adjacentHelmScreen('left', 1)).toBe('center')
    expect(adjacentHelmScreen('center', 1)).toBe('right')
    expect(adjacentHelmScreen('right', 1)).toBe(null)
    expect(adjacentHelmScreen('left', -1)).toBe(null)
    expect(adjacentHelmScreen('center', -1)).toBe('left')
    expect(adjacentHelmScreen('right', -1)).toBe('center')
  })

  it('hopHelmScreen hops or escapes', () => {
    expect(hopHelmScreen('left', 1)).toBe('center')
    expect(hopHelmScreen('right', 1)).toBe(null)
    expect(hopHelmScreen('left', -1)).toBe(null)
  })

  it('allHelmScreens returns all three', () => {
    expect(allHelmScreens()).toEqual(['left', 'center', 'right'])
  })

  it('helmScreenIndex and helmScreenAt are inverses', () => {
    expect(helmScreenIndex('left')).toBe(0)
    expect(helmScreenIndex('center')).toBe(1)
    expect(helmScreenIndex('right')).toBe(2)
    expect(helmScreenAt(0)).toBe('left')
    expect(helmScreenAt(1)).toBe('center')
    expect(helmScreenAt(2)).toBe('right')
    expect(helmScreenAt(99)).toBe(null)
  })
})
