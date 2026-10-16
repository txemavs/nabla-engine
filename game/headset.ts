/** Two self-contained entry cards. Supported AR is prepared in advance so
 * the Enter handler keeps the original user activation for WebXR. */
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
    status.textContent = ''
  })().catch((error) => {
    status.textContent = `No se ha podido preparar AR: ${String(error)}. Recarga para intentarlo de nuevo.`
    enter.disabled = true
  }))
}
ride.addEventListener('click', (event) => {
  if (ride.getAttribute('aria-disabled') === 'true') event.preventDefault()
})
async function checkSupport() {
  const supported = async (mode: XRSessionMode) => {
    try { return isSecureContext && !!navigator.xr && await navigator.xr.isSessionSupported(mode) }
    catch { return false }
  }
  const [vr, ar] = await Promise.all([supported('immersive-vr'), supported('immersive-ar')])
  ride.setAttribute('aria-disabled', String(!vr))
  ride.tabIndex = vr ? 0 : -1
  ride.textContent = vr ? 'Entrar en realidad virtual' : 'VR no compatible en este navegador'
  if (ar) {
    enter.textContent = 'Preparando realidad aumentada…'
    await prepareAR()
  } else enter.textContent = 'AR no compatible en este navegador'
}
void checkSupport()
place.addEventListener('change', update)
vehicle.addEventListener('change', update)
window.addEventListener('pageshow', update)
update()
