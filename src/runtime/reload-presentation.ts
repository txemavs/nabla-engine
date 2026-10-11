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
  /** Lift in eye space, metres, with a side tilt that exposes the magazine well. */
  lift: number
  roll: number
  yaw: number
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
  const pose = (amount: number, travel: number, magazineVisible: boolean) => ({
    pitch: RISE * amount,
    lift: 0.085 * amount,
    roll: -0.48 * amount,
    yaw: -0.25 * amount,
    travel,
    magazineVisible,
  })
  if (phase === 'none') return pose(0, 0, true)
  if (phase === 'slide-release') {
    const span = Math.max(1, timings.slideRelease - timings.magazineIn)
    return pose(1 - smooth((ageMs - timings.magazineIn) / span), 0, true)
  }
  if (phase === 'magazine-out') {
    const u = timings.magazineOut > 0 ? ageMs / timings.magazineOut : 1
    const s = smooth(u)
    return pose(s, s, true)
  }
  const span = Math.max(1, timings.magazineIn - timings.magazineOut)
  const u = (ageMs - timings.magazineOut) / span
  // The spent magazine is already on the ground. The fresh one shows for the last 60%.
  if (u < 0.4) return pose(1, 1, false)
  const v = smooth((u - 0.4) / 0.6)
  return pose(1, 1 - v, true)
}
