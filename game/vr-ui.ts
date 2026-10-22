import { pageSearch } from './page-query.js'
import { actorHandAssets } from '../src/runtime/actor.js'
import { bindXRQuality } from '@nabla/engine/xr/ui'
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { t } from '@nabla/engine/i18n'
import { addGameMenuEntries } from '../src/runtime/main-menu.js'

/** An explicit XR entry: the XR page, the demo, or any page opened with `?xr`. */
export function isImmersiveEntry(): boolean {
  return (
    location.pathname === '/xr.html' ||
    location.pathname === '/xr-demo.html' ||
    new URLSearchParams(pageSearch()).has('xr')
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
  // The worn actor's hands (GameRuntime.setActor swaps them live); the glove is the fallback.
  if (new URLSearchParams(pageSearch()).has('xr'))
    void runtime.xr
      .setActorHands(actorHandAssets(runtime.actor))
      .catch(() => runtime.xr.setHandModel('/library/hands/fps-hand-rigged.glb'))
      .catch((error) => {
        console.warn(t('vr.the-gloves-could-not-be-loaded-keeping-the-basic'), error)
      })
  runtime.xr.enableCalibrationScreen()
  bindXRQuality(runtime, [], false)
  const screen = runtime.xr.calibrationScreen!
  document.body.classList.add('nabla-vr')
  const toolbar = document.createElement('nav')
  toolbar.id = 'vr-toolbar'
  toolbar.setAttribute('aria-label', t('vr.virtual-reality'))
  document.body.append(toolbar)
  let terrainStatus = '',
    fps = '— FPS'
  runtime.xr.enableStats()
  runtime.xr.onStats = (text) => {
    fps = text
  }
  screen.mainStatus = () =>
    [fps, terrainStatus, t('vr.x-open-close-grab-the-frame-to-place-it')]
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
      const terrainBase = new URLSearchParams(pageSearch()).get('terrain') || '/terrain'
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
      label: busy ? t('vr.loading-z15') : t('vr.add-nearby-z15'),
      run: () => {
        void loadTerrain()
      },
    },
    {
      id: 'places',
      label: t('vr.choose-place-and-vehicle'),
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
      label: t('vr.exit-vr'),
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
  menu.className = 'nabla-btn'
  menu.textContent = t('vr.monitor-x')
  menu.onclick = () => runtime.xr.toggleMenu()
  const errorStatus = document.createElement('output')
  errorStatus.setAttribute('role', 'status')
  toolbar.append(errorStatus)
  const button = document.createElement('button')
  button.id = 'enter-vr'
  button.className = 'nabla-btn'
  button.textContent = t('vr.enter-vr')
  button.title = t('vr.left-stick-move-steer-right-snap-turn-a-enter-ex')
  // The XR page's own entries go in the main menu (Virtual reality), not a toolbar of their own.
  addGameMenuEntries('vr', [
    { id: 'enter-vr', labelKey: 'vr.enter-vr', element: button },
    { id: 'vr-monitor', labelKey: 'vr.monitor-x', element: menu },
  ])
  button.disabled = true
  if (!isSecureContext || !navigator.xr) {
    button.textContent = 'VR requiere HTTPS y WebXR'
    return
  }
  void navigator.xr
    .isSessionSupported('immersive-vr')
    .then((supported) => {
      button.disabled = !supported
      if (!supported) button.textContent = t('vr.vr-not-available')
    })
    .catch(() => {
      button.textContent = t('vr.vr-not-available')
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
  if (new URLSearchParams(pageSearch()).has('xr')) {
    const hint = document.getElementById('controls-hint')
    if (hint) hint.textContent = button.title
  }
}
