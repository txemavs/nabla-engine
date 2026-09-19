/**
 * Monitor layout — left / center / right screens in the CSS room.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/kind/helmScreen.ts
 *
 * A single screen fills the port hole. Three screens tile horizontally.
 * The hop logic moves focus left/right inside the stage before escaping
 * to a desktop window.
 */

export type HelmScreen = 'left' | 'center' | 'right'

const HELM_SCREENS: HelmScreen[] = ['left', 'center', 'right']

export function parseHelmScreen(value: unknown): HelmScreen {
  if (value === 'left' || value === 'center' || value === 'right') return value
  return 'center'
}

/** Next screen in the direction. Stays on the edge if no neighbour. */
export function adjacentHelmScreen(current: HelmScreen, dir: 1 | -1): HelmScreen | null {
  const idx = HELM_SCREENS.indexOf(current)
  const next = idx + dir
  if (next < 0 || next >= HELM_SCREENS.length) return null
  return HELM_SCREENS[next]!
}

/** Hop from one screen to another, returning the new screen or null if escape. */
export function hopHelmScreen(current: HelmScreen, dir: 1 | -1): HelmScreen | null {
  const next = adjacentHelmScreen(current, dir)
  if (next) return next
  return null
}

/** All three screens. */
export function allHelmScreens(): HelmScreen[] {
  return [...HELM_SCREENS]
}

/** Index 0 = left, 1 = center, 2 = right. */
export function helmScreenIndex(screen: HelmScreen): number {
  return HELM_SCREENS.indexOf(screen)
}

/** From index. */
export function helmScreenAt(idx: number): HelmScreen | null {
  return HELM_SCREENS[idx] ?? null
}
