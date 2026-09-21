import { Color, MathUtils } from 'three'
export type SkyClock = { mode: 'live' } | { mode: 'fixed'; at: string }
export function skyTime(clock: SkyClock | undefined, now = Date.now()): Date {
  return new Date(clock?.mode === 'fixed' ? clock.at : now)
}
/** datetime-local uses the browser timezone; persisted dates are unambiguous UTC instants. */
export function localTimeInput(at: Date): string {
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export function atmosphere(height: number, sunElevation: number, visibility = 220) {
  const day = MathUtils.smoothstep(sunElevation, -0.12, 0.12)
  const space = MathUtils.smoothstep(height, 12000, 100000)
  const twilight = (1 - MathUtils.smoothstep(Math.abs(sunElevation), 0, 0.2)) * (1 - space)
  const color = new Color('#101a32')
    .lerp(new Color('#a6bbd5'), day)
    .lerp(new Color('#c28c7e'), twilight * 0.35)
    .lerp(new Color('#02040c'), space)
  return {
    color,
    day,
    stars: Math.max(1 - day, space),
    near: Math.max(visibility === 220 ? 80 : visibility * 0.7, height * 4),
    far: Math.max(visibility, height * 12),
    space,
  }
}
