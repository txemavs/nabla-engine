import { arMode } from './ar-mode.js'
import { mountXRDeviceInfo } from './xr-device-info.js'
/** Two self-contained entry cards. Supported AR is prepared in advance so
 * the Enter handler keeps the original user activation for WebXR. */
const place = document.querySelector<HTMLSelectElement>('#xr-place')!
const vehicle = document.querySelector<HTMLSelectElement>('#xr-vehicle')!
const ride = document.querySelector<HTMLAnchorElement>('#ride-xr')!
// Tethered PC VR opens the full desktop game, which enters VR from its own VR button.
const pcVR = document.querySelector<HTMLAnchorElement>('#ride-pcvr')!
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
mountXRDeviceInfo(document.querySelector<HTMLElement>('#ar-panel')!)
const mode = arMode()
const modeSelector = document.createElement('select')
modeSelector.setAttribute('aria-label', 'Modo de realidad aumentada')
for (const [value, label] of [
  ['headset', 'AR para casco'],
  ['mobile', 'AR para móvil · experimental'],
]) {
  const option = document.createElement('option')
  option.value = value
  option.textContent = label
  modeSelector.append(option)
}
modeSelector.value = mode
enter.before(modeSelector)
modeSelector.addEventListener('change', () => {
  const url = new URL(location.href)
  url.searchParams.set('arMode', modeSelector.value)
  location.assign(url)
})
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
    enter.textContent = mode === 'mobile' ? 'Entrar en AR móvil' : 'Entrar en AR para casco'
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
    try {
      return isSecureContext && !!navigator.xr && (await navigator.xr.isSessionSupported(mode))
    } catch {
      return false
    }
  }
  const [vr, ar] = await Promise.all([supported('immersive-vr'), supported('immersive-ar')])
  ride.setAttribute('aria-disabled', String(!vr))
  ride.tabIndex = vr ? 0 : -1
  ride.textContent = vr ? 'Entrar en realidad virtual' : 'VR no compatible en este navegador'
  pcVR.hidden = !vr
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
