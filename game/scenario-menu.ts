/**
 * Scenario menu (`/menu.html`): scenarios grouped by category (test ground first), alphabetical
 * inside each group, one row per entry with web and VR entries. Not the engine game/menu.ts.
 */
import { creditLinks, scenarioHref, scenarioMenuGroups, type ScenarioMenuEntry } from '../scenarios-catalog.js'

function row(entry: ScenarioMenuEntry): HTMLElement {
  const card = document.createElement('article')
  card.className = 'nabla-catalog-row'
  card.dataset.scenario = entry.id
  const thumb = document.createElement('div')
  thumb.className = 'nabla-catalog-thumb'
  if (entry.thumbnail) {
    const image = document.createElement('img')
    image.src = entry.thumbnail
    image.alt = ''
    image.loading = 'lazy'
    thumb.append(image)
  } else thumb.textContent = entry.title.charAt(0)
  const body = document.createElement('div')
  body.className = 'nabla-catalog-body'
  const title = document.createElement('h3')
  title.textContent = entry.title
  const description = document.createElement('p')
  description.textContent = entry.description
  body.append(title, description)
  if (entry.credit) {
    const credit = document.createElement('small')
    credit.className = 'nabla-catalog-credit'
    credit.append('Scene by ', creditLinks(entry.credit))
    body.append(credit)
  }
  const actions = document.createElement('div')
  actions.className = 'nabla-catalog-actions'
  const href = scenarioHref(entry.id)
  const play = document.createElement('a')
  play.href = href
  play.textContent = 'Play'
  const vr = document.createElement('a')
  vr.href = href
  vr.className = 'is-secondary'
  vr.textContent = 'Play in VR'
  vr.hidden = true
  vr.dataset.vr = ''
  actions.append(play, vr)
  card.append(thumb, body, actions)
  return card
}

const list = document.querySelector<HTMLElement>('#scenarios')!
for (const group of scenarioMenuGroups()) {
  const section = document.createElement('section')
  section.className = 'nabla-catalog-group'
  section.dataset.category = group.id
  const heading = document.createElement('h2')
  heading.textContent = group.label
  section.append(heading, ...group.entries.map(row))
  list.append(section)
}

// VR entries only where the browser can open an immersive-vr session.
void (async () => {
  try {
    if (!(await navigator.xr?.isSessionSupported('immersive-vr'))) return
  } catch {
    return
  }
  for (const link of document.querySelectorAll<HTMLElement>('[data-vr]')) link.hidden = false
  document.querySelector<HTMLElement>('#vr-hint')!.hidden = false
})()
