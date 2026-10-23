/**
 * Layout of the settings window: tabs, left-navigation groups and the sections in each, by id.
 * Pure data, generic to every host; settings-hud.ts applies it to the existing sections (their
 * DOM, listeners and storage stay). A host configures it with the section ids it adds (e.g. its
 * own `nabla-menu-section-<id>` side-menu sections) and `data-settings-hidden` on <html>.
 */

export const MENU_TABS = [
  // Principal: the main menu's own sections (main-menu.ts menuPane) and the occupied vehicle.
  { id: 'app', labelKey: 'settings.main' },
  { id: 'planet', labelKey: 'settings.world' },
  { id: 'options', labelKey: 'settings.settings' },
  { id: 'dev', labelKey: 'settings.development' },
] as const

export type MenuTabId = (typeof MENU_TABS)[number]['id']

/** A folder of the left navigation (one section alone shows as a plain entry with its name). */
export interface MenuGroup {
  readonly id: string
  readonly labelKey: string
  readonly sections: readonly string[]
}

/** One entry of a tab: a section id, or a group of section ids. */
export type MenuItem = string | MenuGroup

/** Sections shown together as one flat section (no titles of their own), in this order. */
export interface MenuFlatSection {
  readonly id: string
  readonly tab: MenuTabId
  readonly labelKey: string
  readonly members: readonly string[]
}

/** Id of the vehicle group, titled with the occupied vehicle's name and shown only when mounted. */
export const CURRENT_VEHICLE_GROUP = 'current-vehicle'

export const WORLD_OPTIONS_SECTION = 'settings-world-options'

/** Mundo › Ver › Opciones: the world switches as one list, sea once (the panel switch). */
export const MENU_FLAT_SECTIONS: readonly MenuFlatSection[] = [
  {
    id: WORLD_OPTIONS_SECTION,
    tab: 'planet',
    labelKey: 'settings.options',
    members: [
      'road-style',
      'settings-lens-flare',
      'settings-planet-air',
      'settings-planet-sea',
      'settings-traffic-signs',
      'settings-sign-shadows',
      'settings-streetlights',
      'settings-experimental-light-shadows',
      'settings-headlamp',
      'settings-effects',
      'settings-simulated-fire',
      'settings-options-labels',
    ],
  },
]

export const MENU_LAYOUT: Readonly<Record<MenuTabId, readonly MenuItem[]>> = {
  app: [
    'nabla-menu-section-scenarios',
    'nabla-menu-section-info',
    'nabla-menu-section-vr',
    'nabla-menu-section-ar',
    'terrain-cache',
    {
      id: CURRENT_VEHICLE_GROUP,
      labelKey: 'settings.current-vehicle',
      sections: [
        'settings-options-driver',
        'settings-car-beams',
        'settings-vehicle-sound',
        'settings-truck-exhaust',
        'settings-rear-light-nudge',
      ],
    },
  ],
  planet: [
    'settings-map',
    {
      id: 'situation',
      labelKey: 'settings.situation',
      sections: ['settings-planet-time', 'terrain-position'],
    },
    'terrain-source',
    {
      id: 'view',
      labelKey: 'settings.view',
      sections: ['terrain-layers', 'settings-layer-air', WORLD_OPTIONS_SECTION],
    },
    {
      id: 'vehicles',
      labelKey: 'settings.vehicles',
      sections: ['scene-vehicles', 'settings-placed-objects', 'settings-object-layout'],
    },
    {
      id: 'weapon',
      labelKey: 'settings.weapons',
      sections: ['settings-weapon', 'settings-combat'],
    },
  ],
  options: [
    {
      id: 'simulation',
      labelKey: 'settings.simulation',
      sections: [
        'settings-simulation-time',
        'settings-distances',
        'quality-shadows',
        'driving-extras',
      ],
    },
    {
      id: 'controls',
      labelKey: 'settings.controls',
      sections: ['settings-controls', 'settings-usb'],
    },
    {
      id: 'cameras',
      labelKey: 'settings.camera',
      sections: ['camera-extras', 'settings-camera-fov', 'settings-action-cam'],
    },
    {
      id: 'video',
      labelKey: 'settings.video',
      sections: ['display-quality-section', 'settings-sharpness', 'settings-light'],
    },
    { id: 'audio', labelKey: 'settings.audio', sections: ['settings-sound'] },
    'settings-management',
    'settings-actor',
  ],
  dev: [
    {
      id: 'weapons',
      labelKey: 'settings.weapons',
      sections: ['settings-options-sidearm', 'settings-weapon-poses', 'settings-muzzle-flash'],
    },
    'settings-config-planet',
    'settings-collision-debug',
    'settings-diagnostics',
  ],
}

/** Every placed section with its tab, in navigation order (flat members after their section). */
export function layoutSectionTabs(
  layout: Readonly<Record<MenuTabId, readonly MenuItem[]>> = MENU_LAYOUT,
  flat: readonly MenuFlatSection[] = MENU_FLAT_SECTIONS,
): Array<readonly [id: string, tab: MenuTabId]> {
  const out: Array<readonly [string, MenuTabId]> = []
  for (const { id: tab } of MENU_TABS)
    for (const item of layout[tab])
      for (const id of typeof item === 'string' ? [item] : item.sections) {
        out.push([id, tab])
        for (const member of flat.find((section) => section.id === id)?.members ?? [])
          out.push([member, tab])
      }
  return out
}

/** The groups of a layout, with their tab. */
export function layoutGroups(
  layout: Readonly<Record<MenuTabId, readonly MenuItem[]>> = MENU_LAYOUT,
): Array<MenuGroup & { tab: MenuTabId }> {
  return MENU_TABS.flatMap(({ id: tab }) =>
    layout[tab]
      .filter((item): item is MenuGroup => typeof item !== 'string')
      .map((group) => ({ ...group, tab })),
  )
}
