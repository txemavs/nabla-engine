import { expect, it } from 'vitest'
import { MonitorMenu } from '../src/render/monitors/menu.js'
it('routes focused keys, skips disabled items and emits declarative actions', () => {
  const menu = new MonitorMenu([
    { id: 'a', label: 'A', action: { type: 'paint', value: 'red' } },
    { id: 'b', label: 'B', action: { type: 'blocked' }, disabled: true },
    { id: 'c', label: 'C', action: { type: 'paint', value: 'blue' } },
  ])
  expect(menu.key('Enter')).toEqual({ handled: false })
  menu.open = true
  menu.key('ArrowDown')
  expect(menu.selected).toBe(2)
  expect(menu.key('Enter').action).toEqual({ type: 'paint', value: 'blue' })
  menu.key('ArrowDown')
  expect(menu.selected).toBe(0)
  menu.key('ArrowUp')
  expect(menu.selected).toBe(2)
  expect(menu.key('KeyW').handled).toBe(false)
  menu.key('Escape')
  expect(menu.open).toBe(false)
  const empty = new MonitorMenu([])
  empty.open = true
  expect(empty.key('Enter').action).toBeUndefined()
})
