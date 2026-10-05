import type { GameFrame } from '@nabla/engine/runtime/browser'

/**
 * Fill the page's speed and gear readouts from the active control profile: road vehicles
 * show both; on foot, trailers and carrier flight hide them (docs/vehicle-controls.md).
 */
export function showTelemetry(frame: GameFrame, root: Pick<Document, 'getElementById'> = document) {
  const speed = root.getElementById('speed-display')
  const gear = root.getElementById('gear-display')
  if (speed) {
    speed.hidden = !frame.controls.speed
    speed.textContent = frame.controls.speed ? Math.round(frame.speedKmh) + ' km/h' : ''
  }
  if (gear) {
    gear.hidden = !frame.controls.gear
    gear.textContent = frame.controls.gear ? (frame.gearLabel ?? '') : ''
  }
}
