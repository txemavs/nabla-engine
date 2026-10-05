/** The in-game menu is the existing `#display-settings` panel; features add titled sections to it in order. */
export function menuSection(id: string, title: string): HTMLFieldSetElement {
  const panel = document.getElementById('display-settings')!
  let sections = document.getElementById('menu-sections')
  if (!sections) {
    sections = document.createElement('div')
    sections.id = 'menu-sections'
    panel.querySelector('summary')!.after(sections)
  }
  const group = document.createElement('fieldset')
  group.id = id
  group.className = 'menu-section'
  const legend = document.createElement('legend')
  legend.textContent = title
  group.append(legend)
  sections.append(group)
  return group
}
