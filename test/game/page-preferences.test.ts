import { expect, it } from 'vitest'
import { mergePagePreferences } from '../../game/page-query.js'

it('restores preferences over fixed host defaults without importing another scene or room', () => {
  const query = new URLSearchParams(
    mergePagePreferences(
      '?quality=low&scale=0.5&tile=host&room=host',
      '?quality=high&fps=60&scale=1.5&fsr=quality&tile=other&room=other&token=secret',
    ),
  )
  expect(query.getAll('quality')).toEqual(['high'])
  expect(query.get('scale')).toBe('1.5')
  expect(query.get('fps')).toBe('60')
  expect(query.get('fsr')).toBe('quality')
  expect(query.get('tile')).toBe('host')
  expect(query.get('room')).toBe('host')
  expect(query.has('token')).toBe(false)
})
