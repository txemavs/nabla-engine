/**
 * Gear shown on dashboards and HUDs: `R`, `D1`..`Dn` in automatic mode and `M1`..`Mn` while
 * the driver holds a manual gear. Shared so the game HUD, the car cluster and Studio agree.
 */
export function gearLabel(gear: number, manual: boolean): string {
  return gear < 0 ? 'R' : `${manual ? 'M' : 'D'}${gear}`
}
