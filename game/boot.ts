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
  /** Run the ~3 s machine probe when resolution is auto (default true). */
  probe?: boolean
  /** Probe length in milliseconds (default 3000). */
  probeMs?: number
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
  const merged: HostBootConfig = { ...url, ...built, ...host }
  // An explicit URL ?boot= still wins so testers can compare both modes on a skinned host.
  if (boot === 'attract' || boot === 'classic') merged.attract = url.attract
  merged.splash = { ...(built.splash ?? {}), ...(host.splash ?? {}) }
  if (merged.attract && !merged.splash.layout) merged.splash.layout = 'corner'
  return merged
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
