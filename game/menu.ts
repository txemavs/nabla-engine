/**
 * The in-game menu is the existing `#display-settings` panel; features add titled sections to it in order.
 * Once the game starts, the settings HUD (`settings-hud.ts`, `SECTION_TABS`) moves each section into its tab.
 */

/** Preferred section order after Calidad / Rendimiento. Unknown ids append after these. */
const MENU_SECTION_ORDER = [
  'terrain-position',
  'terrain-layers',
  'road-style',
  'camera-extras',
  'driving-extras',
  'scene-planet',
  'scene-vehicles',
] as const

function menuSections(): HTMLElement {
  const panel = document.getElementById('display-settings')!
  let sections = document.getElementById('menu-sections')
  if (!sections) {
    sections = document.createElement('div')
    sections.id = 'menu-sections'
    panel.append(sections)
  }
  return sections
}

export function menuSection(id: string, title: string): HTMLFieldSetElement {
  const sections = menuSections()
  const group = document.createElement('fieldset')
  group.id = id
  group.className = 'menu-section'
  const legend = document.createElement('legend')
  legend.textContent = title
  group.append(legend)
  const order = (MENU_SECTION_ORDER as readonly string[]).indexOf(id)
  const next = [...sections.children].find((el) => {
    const index = (MENU_SECTION_ORDER as readonly string[]).indexOf(el.id)
    return order === -1 ? false : index === -1 || index > order
  })
  if (next) sections.insertBefore(group, next)
  else sections.append(group)
  return group
}

/** Nested heading inside a menu section (Cielo, Sol, Mar, …). */
export function menuSubtitle(title: string): HTMLParagraphElement {
  const heading = document.createElement('p')
  heading.className = 'menu-subtitle'
  heading.textContent = title
  return heading
}
