/**
 * Gear shown on dashboards and HUDs: `R`, `N`, `P`, `D1`..`Dn` in automatic mode and
 * `M1`..`Mn` while the driver holds a manual gear. Gear 0 is N, or P when `parked`.
 * Shared so the game HUD, the car cluster and Studio agree.
 */
export function gearLabel(gear: number, manual: boolean, parked = false): string {
  if (gear < 0) return 'R'
  if (gear === 0) return parked ? 'P' : 'N'
  return `${manual ? 'M' : 'D'}${gear}`
}
