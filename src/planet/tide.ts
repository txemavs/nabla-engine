/** Visual approximation only: one semidiurnal cycle, no station data or local phase calibration. */
export const TIDE_PERIOD_MS = (12 * 60 + 25) * 60 * 1000
const epoch = Date.UTC(2026, 0, 1)
export function simplifiedTide(time: number, amplitude = 1) {
  const height = Number.isFinite(amplitude) ? Math.max(0, Math.min(3, amplitude)) : 1
  const phase = Number.isFinite(time)
    ? (((time - epoch) % TIDE_PERIOD_MS) / TIDE_PERIOD_MS) * Math.PI * 2
    : 0
  const wave = Math.cos(phase)
  return {
    level: height * wave,
    state:
      height === 0
        ? 'Sin oscilación'
        : wave > 0.98
          ? 'Pleamar'
          : wave < -0.98
            ? 'Bajamar'
            : -Math.sin(phase) > 0
              ? 'Subiendo'
              : 'Bajando',
  }
}
