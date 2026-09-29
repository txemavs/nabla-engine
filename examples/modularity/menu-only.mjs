/** The menu entry point has no Three.js, DOM, physics or vehicle dependencies. */
import assert from 'node:assert/strict'
import { MonitorMenu } from '@nabla/engine/menus'
const menu = new MonitorMenu([
  {
    id: 'settings',
    label: 'SETTINGS',
    children: [{ id: 'blue', label: 'BLUE', action: { type: 'panel.color', value: 'blue' } }],
  },
])
menu.open = true
menu.key('Enter')
assert.deepEqual(menu.key('Enter').action, { type: 'panel.color', value: 'blue' })
menu.key('Escape')
assert.equal(menu.depth, 0)
assert.equal(typeof globalThis.document, 'undefined')
console.log('Standalone menu: submenu, action and back passed without a vehicle instance.')
