import { bindXRQuality } from '@nabla/engine/xr/ui'
import type { GameRuntime } from '@nabla/engine/runtime/browser'

/** An explicit XR entry: the XR page, the demo, or any page opened with `?xr`. */
export function isImmersiveEntry(): boolean {
  return (
    location.pathname === '/xr.html' ||
    location.pathname === '/xr-demo.html' ||
    new URLSearchParams(location.search).has('xr')
  )
}

/**
 * Start loading the XR code as soon as the runtime exists on an explicit XR entry, so the XR
 * system is ready before `play()` resolves (as when it was bundled statically).
 */
export function preloadVR(runtime: GameRuntime): void {
  if (isImmersiveEntry())
    void runtime.loadXR().catch((error) => console.error('XR could not be loaded', error))
}

/** Mount immersive controls only for an explicit XR entry; desktop keeps its own UI. */
export function bindVR(runtime: GameRuntime): void {
  if (!isImmersiveEntry()) return
  // Already loaded (preloadVR): mount synchronously, exactly as before the lazy split.
  if (runtime.xrLoaded) return mountVR(runtime)
  // XR code is loaded on demand; only an explicit XR entry pays for it.
  void runtime
    .loadXR()
    .then(() => mountVR(runtime))
    .catch((error) => console.error('XR could not be loaded', error))
}

function mountVR(runtime: GameRuntime): void {
  if (new URLSearchParams(location.search).has('xr'))
    void runtime.xr.setHandModel('/library/hands/fps-hand-rigged.glb').catch((error) => {
      console.warn('No se pudieron cargar los guantes; se mantienen las manos básicas.', error)
    })
  runtime.xr.enableCalibrationScreen()
  bindXRQuality(runtime, [], false)
  const screen = runtime.xr.calibrationScreen!
  const style = document.createElement('style')
  style.textContent = `
    body.nabla-vr :is(#display-settings,#controls-hint,#xr-destinations,
      #game-hud,.nabla-game-hud,.game-toolbar,.touch-driving,.touch-flight,.touch-walk) { display:none !important; }
    #vr-toolbar { position:fixed;top:12px;right:12px;z-index:10005;display:flex;gap:8px; }
    #vr-toolbar button { background:#252525;color:#eee;border:1px solid #444;
      border-radius:2px;min-height:36px;padding:8px 14px;font:20px system-ui;cursor:pointer; }
    #vr-toolbar button:disabled { opacity:.5;cursor:default; }
  `
  document.head.append(style)
  document.body.classList.add('nabla-vr')
  const toolbar = document.createElement('nav')
  toolbar.id = 'vr-toolbar'
  toolbar.setAttribute('aria-label', 'Realidad virtual')
  document.body.append(toolbar)
  let terrainStatus = '',
    fps = '— FPS'
  runtime.xr.enableStats()
  runtime.xr.onStats = (text) => {
    fps = text
  }
  screen.mainStatus = () =>
    [fps, terrainStatus, 'X: abrir/cerrar · Agarra el marco para colocarlo']
      .filter(Boolean)
      .join(' · ')
  let busy = false
  const progress = (text: string) => {
    terrainStatus = text
  }
  const loadTerrain = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const terrainBase = new URLSearchParams(location.search).get('terrain') || '/terrain'
      const base =
        terrainBase === '/terrain' ? import.meta.env.VITE_TERRAIN_EXTRA || terrainBase : terrainBase
      progress(await runtime.loadNearestZ15(base, progress))
    } catch (error) {
      progress(error instanceof Error ? error.message : String(error))
    } finally {
      busy = false
    }
  }
  const leave = async () => {
    await runtime.xr.exit()
  }
  screen.mainMenu = () => [
    {
      id: 'terrain',
      label: busy ? 'Cargando Z15…' : 'Añadir Z15 cercano',
      run: () => {
        void loadTerrain()
      },
    },
    {
      id: 'places',
      label: 'Elegir lugar y vehículo',
      run: () => {
        void leave()
          .then(() => location.assign('/headset.html'))
          .catch((error) => {
            terrainStatus = String(error)
          })
      },
    },
    {
      id: 'exit',
      label: 'Salir de VR',
      run: () => {
        void leave().catch((error) => {
          terrainStatus = String(error)
        })
      },
    },
  ]
  screen.mainMenuOrder = [
    'quality',
    'options',
    'development',
    'terrain',
    'places',
    'board',
    'target',
    'exit',
  ]
  screen.navigate('main')
  const menu = document.createElement('button')
  menu.id = 'vr-monitor'
  menu.textContent = 'Monitor · X'
  menu.onclick = () => runtime.xr.toggleMenu()
  toolbar.append(menu)
  const errorStatus = document.createElement('output')
  errorStatus.setAttribute('role', 'status')
  toolbar.append(errorStatus)
  const button = document.createElement('button')
  button.id = 'enter-vr'
  button.textContent = 'Entrar en VR'
  button.title =
    'Stick izquierdo: moverse/dirección · Derecho: giro a pasos · A: entrar/salir · B: saltar/frenar · X: monitor principal · Y: recuperar. Dos pistolas en fundas laterales: mantén agarre para coger; gatillo para disparar. Cargador normal en pecho izquierdo, largo en derecho. Usa agarre para sacar, insertar o tirar cargadores y mover la corredera. Volante: acercar la mano, mantener agarre y girar; B frena.'
  toolbar.append(button)
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
        errorStatus.textContent = error instanceof Error ? error.message : String(error)
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
