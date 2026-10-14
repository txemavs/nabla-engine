import { bindXRQuality } from './xr-quality-ui.js'
import { bindXRCalibration } from './xr-calibration-ui.js'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

/** Both online terrain and test.html use the Engine's immersive session. */
export function bindVR(runtime: GameRuntime): void {
  bindXRCalibration(runtime)
  runtime.xr.enableCalibrationScreen()
  bindXRQuality(runtime)
  if (new URLSearchParams(location.search).has('xr')) {
    runtime.xr.enableStats()
    const output = document.createElement('output')
    output.id = 'xr-stats'
    output.style.cssText =
      'position:fixed;left:12px;bottom:12px;z-index:9999;white-space:pre-line;background:#102632e8;color:#eefaff;padding:10px;border-radius:8px;font:14px monospace;pointer-events:none'
    output.textContent = '— FPS'
    document.body.append(output)
    runtime.xr.onStats = (text) => {
      output.textContent = text
    }
  }
  const terrain = document.createElement('button')
  terrain.id = 'load-nearest-z15'
  terrain.textContent = '+'
  terrain.title = 'Añadir Z15 cercano'
  terrain.setAttribute('aria-label', terrain.title)
  terrain.style.cssText =
    'position:fixed;right:16px;top:68px;z-index:10002;padding:12px 18px;background:#16445b;color:white;border:1px solid #79bad4;border-radius:8px;cursor:pointer'
  const status = document.createElement('output')
  status.id = 'terrain-load-status'
  status.setAttribute('role', 'status')
  status.style.cssText =
    'position:fixed;right:16px;top:120px;max-width:320px;z-index:10002;background:#102632e8;color:white;padding:6px;border-radius:6px;font:14px sans-serif;pointer-events:none'
  status.hidden = true
  document.body.append(terrain, status)
  let busy = false
  const progress = (text: string) => {
    if (status.textContent === text) return
    status.hidden = true
    terrain.title = text
    status.textContent = text
    runtime.xr.setTerrainStatus(text)
  }
  const loadTerrain = async (): Promise<void> => {
    if (busy) return
    busy = true
    terrain.disabled = true
    try {
      const terrainBase = new URLSearchParams(location.search).get('terrain') || '/terrain'
      const base =
        terrainBase === '/terrain' ? import.meta.env.VITE_TERRAIN_EXTRA || terrainBase : terrainBase
      progress(await runtime.loadNearestZ15(base, progress))
    } catch (error) {
      progress(error instanceof Error ? error.message : String(error))
    } finally {
      busy = false
      terrain.disabled = false
    }
  }
  terrain.onclick = () => {
    void loadTerrain()
  }
  runtime.xr.enableTerrainButton(loadTerrain)
  runtime.xr.enableExitButton()
  const exit = document.createElement('button')
  exit.id = 'exit-vr'
  exit.textContent = 'X'
  exit.title = 'Salir de VR'
  exit.setAttribute('aria-label', exit.title)
  exit.style.cssText =
    'position:fixed;right:16px;top:16px;z-index:10002;padding:12px 18px;background:#843526;color:white;border:1px solid #ffb4a0;border-radius:8px;cursor:pointer'
  exit.onclick = () => {
    void runtime.xr.exit().catch((error: unknown) => {
      const message = document.getElementById('game-message')
      if (message) message.textContent = error instanceof Error ? error.message : String(error)
    })
  }
  document.body.append(exit)
  const button = document.createElement('button')
  button.id = 'enter-vr'
  button.textContent = 'Entrar en VR'
  button.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:10000;padding:12px 18px;background:#123448;color:white;border:1px solid #79bad4;border-radius:8px;cursor:pointer'
  button.title =
    'Stick izquierdo: moverse/dirección · Derecho: giro a pasos · A: entrar/salir · B: saltar/frenar · X: menú Calidad/Desarrollo · Y: recuperar. Dos pistolas en fundas laterales: mantén agarre para coger; gatillo para disparar. Cargador normal en pecho izquierdo, largo en derecho. Usa agarre para sacar, insertar o tirar cargadores y mover la corredera. Volante: acercar la mano, mantener agarre y girar; B frena.'
  document.body.append(button)
  button.disabled = true
  if (!isSecureContext || !navigator.xr) {
    button.textContent = 'VR requiere HTTPS y WebXR'
    return
  }
  void navigator.xr
    .isSessionSupported('immersive-vr')
    .then((supported) => {
      button.disabled = !supported
      if (!supported) button.textContent = 'VR no disponible'
    })
    .catch(() => {
      button.textContent = 'VR no disponible'
    })
  button.onclick = () => {
    runtime.startMusic() // Unlock Web Audio while this click still has user activation.
    button.disabled = true
    void runtime.xr
      .enter()
      .catch((error: unknown) => {
        const message = document.getElementById('game-message')
        if (message) message.textContent = error instanceof Error ? error.message : String(error)
      })
      .finally(() => {
        button.disabled = false
      })
  }
  if (new URLSearchParams(location.search).has('xr')) {
    const hint = document.getElementById('controls-hint')
    if (hint) hint.textContent = button.title
  }
}
