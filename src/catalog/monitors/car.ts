import type { MonitorDefinition } from '../../render/monitors/layered-monitor.js'
import type { MonitorMenuItem } from '../../render/monitors/menu.js'

const back: MonitorMenuItem = { id: 'back', label: 'VOLVER', back: true }
export const carMenuItems: MonitorMenuItem[] = [
  {
    id: 'paint',
    label: 'COLOR COCHE',
    children: [
      { id: 'silver', label: 'GRIS PLATA', action: { type: 'vehicle.paint', value: '#dadde1' } },
      { id: 'black', label: 'NEGRO', action: { type: 'vehicle.paint', value: '#17191e' } },
      { id: 'red', label: 'ROJO', action: { type: 'vehicle.paint', value: '#b91929' } },
      { id: 'blue', label: 'AZUL', action: { type: 'vehicle.paint', value: '#2157a5' } },
      { id: 'white', label: 'BLANCO', action: { type: 'vehicle.paint', value: '#f0f0ea' } },
      back,
    ],
  },
  {
    id: 'mirrors',
    label: 'ESPEJOS',
    children: [
      { id: 'mirror-up', label: 'SUBIR +1', action: { type: 'vehicle.mirror', value: '1' } },
      { id: 'mirror-down', label: 'BAJAR -1', action: { type: 'vehicle.mirror', value: '-1' } },
      back,
    ],
  },
]
/** Edit the panel, positions and bindings here; no keyboard or game logic in the layout. */
export const carMenuDefinition: MonitorDefinition = {
  width: 600,
  height: 400,
  layers: [
    { id: 'background', kind: 'panel', x: 0, y: 0, width: 600, height: 400, color: '#080d16' },
    { id: 'accent', kind: 'panel', x: 22, y: 80, width: 556, height: 4, color: '#ff3344' },
    {
      id: 'title',
      kind: 'text',
      x: 24,
      y: 18,
      width: 552,
      height: 50,
      columns: 18,
      binding: 'title',
    },
    ...[0, 1, 2].map((i) => ({
      id: `row${i}`,
      kind: 'text' as const,
      x: 35,
      y: 90 + i * 82,
      width: 561,
      height: 80,
      columns: 11,
      binding: `row${i}`,
    })),
    { id: 'selection', kind: 'panel', x: 12, y: 98, width: 8, height: 65, color: '#ff3344' },
    {
      id: 'help',
      kind: 'text',
      x: 24,
      y: 350,
      width: 550,
      height: 24,
      columns: 36,
      binding: 'help',
      color: '#9daac2',
    },
  ],
}
