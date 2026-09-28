import type { MonitorDefinition } from '../../render/monitors/layered-monitor.js'
import type { MonitorMenuItem } from '../../render/monitors/menu.js'

export const carMenuItems: MonitorMenuItem[] = [
  { id: 'silver', label: 'GRIS PLATA', action: { type: 'vehicle.paint', value: '#dadde1' } },
  { id: 'black', label: 'NEGRO', action: { type: 'vehicle.paint', value: '#17191e' } },
  { id: 'red', label: 'ROJO', action: { type: 'vehicle.paint', value: '#b91929' } },
  { id: 'blue', label: 'AZUL', action: { type: 'vehicle.paint', value: '#2157a5' } },
  { id: 'white', label: 'BLANCO', action: { type: 'vehicle.paint', value: '#f0f0ea' } },
]
/** Edit the panel, positions and bindings here; no keyboard or game logic in the layout. */
export const carMenuDefinition: MonitorDefinition = {
  width: 600,
  height: 400,
  layers: [
    { id: 'background', kind: 'panel', x: 0, y: 0, width: 600, height: 400, color: '#080d16' },
    { id: 'accent', kind: 'panel', x: 22, y: 60, width: 556, height: 4, color: '#ff3344' },
    {
      id: 'title',
      kind: 'text',
      x: 24,
      y: 18,
      width: 420,
      height: 34,
      columns: 20,
      binding: 'title',
    },
    ...carMenuItems.map((item, i) => ({
      id: item.id,
      kind: 'text' as const,
      x: 30,
      y: 85 + i * 48,
      width: 490,
      height: 32,
      columns: 24,
      binding: item.id,
    })),
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
