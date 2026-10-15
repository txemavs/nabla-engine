/** One launcher. The AR demo is prepared only when its tab is selected, then
 * its existing Enter handler requests WebXR directly from the user's click.
 */
const place = document.querySelector<HTMLSelectElement>('#xr-place')!
const vehicle = document.querySelector<HTMLSelectElement>('#xr-vehicle')!
const ride = document.querySelector<HTMLAnchorElement>('#ride-xr')!
const launcher = document.querySelector<HTMLElement>('#headset-launcher')!
const enter = document.querySelector<HTMLButtonElement>('#enter')!
const status = document.querySelector<HTMLElement>('#status')!
const update = () => {
  const query = new URLSearchParams({
    xr: '1',
    solo: '1',
    vehicle: vehicle.value,
    quality: 'minimal',
  })
  if (place.value === 'z15') {
    for (const [key, value] of Object.entries({
      terrain: import.meta.env.VITE_NABLA_TILES_URL || '/terrain',
      tile: import.meta.env.VITE_NABLA_HEADSET_TILE || '16224/11998',
      photo: 'lo',
      relief: import.meta.env.VITE_NABLA_HEADSET_RELIEF || 'engine',
      time: '12:00',
    }))
      query.set(key, value)
  } else query.set('example', 'flat')
  ride.href = `/xr.html?${query}`
}
let arReady: Promise<void> | undefined
function prepareAR(): Promise<void> {
  return (arReady ??= (async () => {
    status.textContent = 'Preparando el entorno AR…'
    // Reuse the existing demo controls and application, without a second page or iframe.
    const { default: markup } = await import('./ar.html?raw')
    const template = new DOMParser().parseFromString(markup, 'text/html')
    const panel = template.querySelector<HTMLElement>('#panel')!
    panel.querySelector('#enter')?.remove()
    panel.querySelector('#status')?.remove()
    panel.classList.add('ar-storage')
    const canvas = template.querySelector<HTMLCanvasElement>('#viewport')!
    canvas.hidden = true
    document.body.append(canvas, panel)
    const ar = await import('./ar.js')
    ar.configureARHost((active) => {
      launcher.hidden = active
      canvas.hidden = !active
      if (!active) enter.focus()
    })
    enter.textContent = 'Entrar en realidad aumentada'
  })().catch((error) => {
    status.textContent = `No se ha podido preparar AR: ${String(error)}. Recarga para intentarlo de nuevo.`
    enter.disabled = true
  }))
}
function selectTab(mode: 'vr' | 'ar') {
  for (const name of ['vr', 'ar']) {
    const selected = name === mode
    const tab = document.getElementById(`tab-${name}`)!
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    document.getElementById(`${name}-panel`)!.hidden = !selected
  }
  if (mode === 'ar') void prepareAR()
}
for (const mode of ['vr', 'ar'] as const) {
  const tab = document.getElementById(`tab-${mode}`)!
  tab.onclick = () => selectTab(mode)
  tab.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next =
      event.key === 'Home' ? 'vr' : event.key === 'End' ? 'ar' : mode === 'vr' ? 'ar' : 'vr'
    selectTab(next)
    document.getElementById(`tab-${next}`)!.focus()
  }
}
place.addEventListener('change', update)
vehicle.addEventListener('change', update)
window.addEventListener('pageshow', update)
update()
