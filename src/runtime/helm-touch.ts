export type HelmTouchAxis = 'forward' | 'right' | 'lift' | 'turn' | 'brake'

/**
 * Studio helm d-pad commands. Road mode remaps the WASD pad (lift/turn) onto
 * drive axes so the same tactile panel steers, accelerates and brakes.
 */
export function helmTouchAxis(
  action: string,
  flight: boolean,
): { axis: HelmTouchAxis; sign: number } | null {
  if (action === 'brake') return { axis: 'brake', sign: 1 }
  const [raw, signText] = action.split(':')
  const sign = Number(signText)
  if (!Number.isFinite(sign) || sign === 0) return null
  let axis = raw as HelmTouchAxis
  if (!flight) {
    if (axis === 'lift') axis = 'forward'
    if (axis === 'turn') axis = 'right'
  }
  if (axis === 'forward' || axis === 'right' || axis === 'lift' || axis === 'turn')
    return { axis, sign }
  return null
}
