/**
 * Standalone-game boot policy: host splash skin, optional attract (planet-from-orbit) view
 * and the short machine probe that picks the auto resolution start.
 *
 * Host overrides, highest first:
 *   1. `window.NABLA_BOOT` set by an inline script before `main.ts` loads
 *   2. `VITE_NABLA_BOOT` JSON at build time
 *   3. URL: `?boot=attract` (attract view), `?probe=0` (skip the probe)
 * Defaults keep the classic centred Nabla splash, no attract, probe on in auto scale.
 */
import type { EngineSplashSkin } from '@nabla/engine/runtime/splash'
import type { AttractOptions, GameRuntime } from '@nabla/engine/runtime/browser'
import type { LoadingScreen } from './loading.js'
import { wantsAutoResolution } from './display-settings.js'

export interface HostBootConfig {
  /** Splash slots: logo URL, title, message list, layout, theme CSS. */
  splash?: EngineSplashSkin
  /** Planet-from-orbit boot view while terrain and vehicles stream; true uses defaults. */
  attract?: boolean | AttractOptions
  /**
   * Black, mark-only pre-attract: shorthand for `attract: true` (unless set) with
   * `splash: { layout: 'mark', messages: [], status: false }`. Only the small Nabla ▽ (or
   * `splash.logoUrl`) shows bottom-right, then the planet attract view behind it.
   */
  preAttract?: boolean
  /** Run the ~3 s machine probe when resolution is auto (default true). */
  probe?: boolean
  /** Probe length in milliseconds (default 3000). */
  probeMs?: number
  /**
   * Floating city / town / village names over the terrain (layer `places`). Default true.
   * `false` starts with them hidden; the player can still switch them on in Ajustes → Opciones → Mapa,
   * and `?layers=+places` / `?layers=-places` override for one visit.
   */
  cityLabels?: boolean
  /**
   * Post-flip cinematic camera (two rolls in under a second). Default on when omitted.
   * Hosts set this on `window.NABLA_BOOT`; players can also toggle it in Ajustes → Opciones → Cámara.
   */
  flipCinematic?: boolean
  /**
   * R reset puts the vehicle on the nearest road/vía. Default on when omitted.
   * URL `?recoverToRoad=0|1` (alias `?roadReset=`); players can toggle it in Ajustes → Opciones.
   */
  recoverToRoad?: boolean
  /**
   * Host default asphalt contrast on the roads photo drape, 0.5–2.5 (omitted = 1, unchanged).
   * The player's slider in Ajustes → Calidad → Asfalto is stored and wins over it;
   * `?asphaltContrast=1.6` overrides both for one visit.
   */
  asphaltContrast?: number
}

declare global {
  interface Window {
    NABLA_BOOT?: HostBootConfig
  }
}

function buildTimeBoot(): HostBootConfig {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_NABLA_BOOT
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as HostBootConfig) : {}
  } catch {
    console.warn('VITE_NABLA_BOOT is not valid JSON; using the default boot')
    return {}
  }
}

/** Merge URL, build-time and page-supplied boot configuration. */
export function readBootConfig(
  search = location.search,
  page: Pick<Window, 'NABLA_BOOT'> | undefined = globalThis.window,
): HostBootConfig {
  const params = new URLSearchParams(search)
  const built = buildTimeBoot()
  const host = page?.NABLA_BOOT ?? {}
  const url: HostBootConfig = {}
  const boot = params.get('boot')
  if (boot === 'attract') url.attract = true
  else if (boot === 'classic') url.attract = false
  if (params.get('probe') === '0') url.probe = false
  const flip = params.get('flipCinematic') ?? params.get('flipcam')
  if (flip === '0' || flip === 'false') url.flipCinematic = false
  else if (flip === '1' || flip === 'true') url.flipCinematic = true
  const road = params.get('recoverToRoad') ?? params.get('roadReset')
  if (road === '0' || road === 'false') url.recoverToRoad = false
  else if (road === '1' || road === 'true') url.recoverToRoad = true
  const merged: HostBootConfig = { ...url, ...built, ...host }
  if (url.flipCinematic !== undefined) merged.flipCinematic = url.flipCinematic
  if (url.recoverToRoad !== undefined) merged.recoverToRoad = url.recoverToRoad
  // An explicit URL ?boot= still wins so testers can compare both modes on a skinned host.
  if (boot === 'attract' || boot === 'classic') merged.attract = url.attract
  let splash: EngineSplashSkin = { ...(built.splash ?? {}), ...(host.splash ?? {}) }
  if (merged.preAttract) {
    if (merged.attract === undefined) merged.attract = true
    splash = { layout: 'mark', messages: [], status: false, ...splash }
  }
  if (merged.attract && !splash.layout) splash.layout = 'corner'
  merged.splash = splash
  return merged
}

/** The host's default hidden terrain layers, the base for the URL and the stored player choice. */
export function bootHiddenLayers(config: HostBootConfig): string[] {
  return config.cityLabels === false ? ['places'] : []
}

/**
 * Start attract and the probe; call right before `play()` without awaiting the probe.
 * The probe overlaps the terrain wait and `play()` finishes it before gameplay frames start.
 * `play()` stops attract once the simulation starts.
 */
export async function runBootPhase(
  runtime: GameRuntime,
  loading: LoadingScreen,
  config: HostBootConfig,
  search = location.search,
): Promise<void> {
  const canvas = document.getElementById('game-canvas')
  if (config.attract) {
    runtime.startAttract(typeof config.attract === 'object' ? config.attract : {})
    loading.setPhase(0)
  }
  if (config.probe === false || !wantsAutoResolution(search)) return
  try {
    const result = await runtime.probeMachine({ durationMs: config.probeMs })
    canvas?.dispatchEvent(new CustomEvent('nabla:probe', { detail: result }))
  } catch (error) {
    // The probe is advisory: a failure leaves auto mode at its 50% start.
    console.warn('Machine probe skipped:', error)
  }
}
