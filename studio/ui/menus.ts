import type { DesktopMenu } from '@nabla/desktop/core'
import { entityCatalog } from '../../src/catalog/palette.js'
export const commandItems = (...ids: string[]) => ids.map((command) => ({ command }))
export const mainMenus: DesktopMenu[] = [
  {
    id: 'file',
    label: 'Archivo',
    items: [
      ...commandItems('new-planet', 'import', 'save-as', 'save', 'export'),
      { separator: true },
      ...commandItems('play'),
    ],
  },
  {
    id: 'edit',
    label: 'Editar',
    items: [
      ...commandItems('undo', 'redo'),
      { separator: true },
      ...commandItems('capability', 'preferences'),
    ],
  },
  { id: 'mode', label: 'Modo', items: commandItems('mode-object', 'mode-edit') },
  {
    id: 'view',
    label: 'Ver',
    items: [
      ...commandItems(
        'world',
        'map',
        'scene',
        'layers',
        'generation',
        'properties',
        'planet',
        'information',
        'sequences',
      ),
      { separator: true },
      ...commandItems('reset-layout'),
    ],
  },
  { id: 'help', label: 'Ayuda', items: commandItems('help-controls') },
]
export const viewMenus: DesktopMenu[] = [
  {
    id: 'object',
    label: 'Objeto',
    items: commandItems(
      'translate',
      'rotate',
      'exact-transform',
      'focus',
      'duplicate',
      'delete',
      'capability',
    ),
  },
  {
    id: 'add',
    label: 'Añadir',
    items: commandItems(
      'add-solid',
      'add-box',
      ...entityCatalog.map((entry) => `add-${entry.id}`),
      'add-sprite',
      'add-group',
      'sample-portals',
      'sample-gallery',
    ),
  },
  { id: 'view3d', label: 'Vista', items: commandItems('focus', 'cursor-view') },
]
export const toolCommands = [
  'cursor-select',
  'cursor-selection',
  'cursor-view',
  'selection-cursor',
  'origin-cursor',
  'select',
  'duplicate',
  'delete',
  'translate',
  'rotate',
]
