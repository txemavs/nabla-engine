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

/** Related shadow controls share one destination while retaining their controls and storage. */
export const MENU_FLAT_SECTIONS: readonly MenuFlatSection[] = [
  {
    id: 'settings-video-options',
    tab: 'options',
    labelKey: 'settings.options',
    members: ['camera-extras', 'settings-camera-fov', 'settings-camera-motion'],
  },
  {
    id: 'settings-video-effects',
    tab: 'options',
    labelKey: 'settings.effects',
    members: ['settings-effects', 'settings-simulated-fire'],
  },
  {
    id: 'settings-video-shadows',
    tab: 'options',
    labelKey: 'settings.shadows',
    members: [
      'quality-shadows',
      'settings-shadow-quality',
      'settings-sign-shadows',
      'settings-experimental-light-shadows',
      'settings-light-shadows',
      'settings-headlamp',
    ],
  },
]

export const MENU_LAYOUT: Readonly<Record<MenuTabId, readonly MenuItem[]>> = {
  app: [
    'nabla-menu-section-scenarios',
    'nabla-menu-section-info',
    'nabla-menu-section-vr',
    'nabla-menu-section-ar',
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
    {
      id: 'terrain',
      labelKey: 'settings.terrain',
      sections: [
        'terrain-source',
        'terrain-layers',
        'road-style',
        'settings-traffic-signs',
        'settings-streetlights',
        'settings-options-labels',
      ],
    },
    {
      id: 'environment',
      labelKey: 'settings.environment',
      sections: [
        'settings-layer-air',
        'settings-layer-celestial',
        'settings-planet-air',
        'settings-planet-sea',
      ],
    },
    {
      id: 'objects',
      labelKey: 'settings.objects',
      sections: ['scene-vehicles', 'settings-placed-objects', 'settings-object-layout'],
    },
  ],
  options: [
    {
      id: 'video',
      labelKey: 'settings.video',
      sections: [
        'settings-video-options',
        'display-quality-section',
        'settings-action-cam',
        'settings-video-effects',
        'settings-video-shadows',
        'settings-light',
        'settings-distances',
      ],
    },
    {
      id: 'controls',
      labelKey: 'settings.controls',
      sections: [
        'settings-input',
        'settings-keyboard-response',
        'settings-controls',
        'settings-usb',
      ],
    },
    {
      id: 'player',
      labelKey: 'settings.player',
      sections: ['settings-actor'],
    },
    {
      id: 'weapons',
      labelKey: 'settings.weapons',
      sections: [
        'settings-weapon',
        'settings-options-sidearm',
        'settings-weapon-poses',
        'settings-muzzle-flash',
        'settings-combat',
      ],
    },
    {
      id: 'simulation',
      labelKey: 'settings.simulation',
      sections: ['settings-simulation-time', 'driving-extras', 'settings-sound'],
    },
    {
      id: 'data',
      labelKey: 'settings.data-and-preferences',
      sections: ['terrain-cache', 'settings-management'],
    },
  ],
  dev: ['settings-collision-debug', 'settings-diagnostics'],
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
