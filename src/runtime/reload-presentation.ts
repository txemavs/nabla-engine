/**
 * First-person reload timing. The firearm clock (`firearm.ts`) is unchanged: the magazine is
 * out at `magazineOut`, seated at `magazineIn`, and the slide closes at `slideRelease`. This
 * only says how the pistol and the viewmodel magazine should look during those phases.
 */

export interface ReloadTimings {
  magazineOut: number
  magazineIn: number
  slideRelease: number
}

export type ReloadPhase = 'none' | 'magazine-out' | 'magazine-in' | 'slide-release'

export interface ReloadPresentation {
  /** Radians, muzzle up. */
  pitch: number
  /** 0 seated in the grip, 1 clear of it. */
  travel: number
  /** Draw the viewmodel magazine. False while the spent one is on the ground and the fresh one has not arrived. */
  magazineVisible: boolean
}

/** How far the muzzle rises during the reload, radians. Artistic, not a measured gesture. */
const RISE = 0.62

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export function reloadPresentation(
  phase: ReloadPhase,
  ageMs: number,
  timings: ReloadTimings,
): ReloadPresentation {
  const seated = { pitch: 0, travel: 0, magazineVisible: true }
  if (phase === 'none' || phase === 'slide-release') return seated
  if (phase === 'magazine-out') {
    const u = timings.magazineOut > 0 ? ageMs / timings.magazineOut : 1
    const s = smooth(u)
    return { pitch: RISE * s, travel: s, magazineVisible: true }
  }
  const span = Math.max(1, timings.magazineIn - timings.magazineOut)
  const u = (ageMs - timings.magazineOut) / span
  // The spent magazine is already on the ground. The fresh one shows for the last 60%.
  if (u < 0.4) return { pitch: RISE, travel: 1, magazineVisible: false }
  const v = smooth((u - 0.4) / 0.6)
  return { pitch: RISE * (1 - v), travel: 1 - v, magazineVisible: true }
}
