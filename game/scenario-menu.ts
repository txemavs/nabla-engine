/** Scenario menu (`/menu.html`): one card per small scenario, web and VR entries. Not the engine game/menu.ts. */
import { SCENARIOS } from '../scenarios-catalog.js'

const list = document.querySelector<HTMLElement>('#scenarios')!
for (const scenario of SCENARIOS) {
  if (scenario.flags?.hidden) continue
  const card = document.createElement('article')
  const title = document.createElement('h2')
  title.textContent = scenario.title
  const description = document.createElement('p')
  description.textContent = scenario.description
  const actions = document.createElement('div')
  actions.className = 'actions'
  const href = `/scenario.html?room=${encodeURIComponent(scenario.id)}`
  const play = document.createElement('a')
  play.href = href
  play.textContent = 'Play'
  const vr = document.createElement('a')
  vr.href = href
  vr.className = 'vr'
  vr.textContent = 'Play in VR'
  vr.hidden = true
  vr.dataset.vr = ''
  actions.append(play, vr)
  const credit = document.createElement('small')
  const source = document.createElement('a')
  source.href = scenario.credit.source
  source.target = '_blank'
  source.rel = 'noopener'
  source.textContent = `“${scenario.credit.title}”`
  const author = document.createElement('a')
  if (scenario.credit.authorUrl) author.href = scenario.credit.authorUrl
  author.target = '_blank'
  author.rel = 'noopener'
  author.textContent = scenario.credit.author
  credit.append(source, ' by ', author, ` · ${scenario.credit.license}`)
  card.append(title, description, actions, credit)
  list.append(card)
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
