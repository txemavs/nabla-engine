import { Color, MathUtils } from 'three'
export type SkyClock = { mode: 'live' } | { mode: 'fixed'; at: string }
export function skyTime(clock: SkyClock | undefined, now = Date.now()): Date {
  return new Date(clock?.mode === 'fixed' ? clock.at : now)
}
/** datetime-local uses the browser timezone; persisted dates are unambiguous UTC instants. */
export function localTimeInput(at: Date): string {
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
/** Minutes after local midnight (0–1439) of an instant, in the viewer's time zone. */
export function localMinutes(at: Date): number {
  return at.getHours() * 60 + at.getMinutes()
}
/** `HH:MM` for minutes after midnight, wrapped into one day. */
export function formatClockTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
/** Parse `H`, `HH:MM`, `HH.MM` or `HHhMM` into minutes after midnight; undefined when invalid. */
export function parseClockTime(text: string): number | undefined {
  const match = /^(\d{1,2})(?:[:.h](\d{2}))?$/.exec(text.trim())
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : undefined
}
/**
 * A fixed clock at `minutes` after local midnight on the calendar day of `clock`
 * (or of `now` for a live clock). Local means the viewer's time zone, like `localTimeInput`.
 */
export function skyClockAtMinutes(
  clock: SkyClock | undefined,
  minutes: number,
  now = Date.now(),
): SkyClock {
  const at = skyTime(clock, now)
  const m = Math.min(1439, Math.max(0, Math.round(minutes)))
  at.setHours(Math.floor(m / 60), m % 60, 0, 0)
  return { mode: 'fixed', at: at.toISOString() }
}
const FOG_CEILING = 100

export function atmosphere(height: number, sunElevation: number, visibility = 220) {
  const day = MathUtils.smoothstep(sunElevation, -0.12, 0.12)
  const space = MathUtils.smoothstep(height, 12000, 100000)
  const twilight = (1 - MathUtils.smoothstep(Math.abs(sunElevation), 0, 0.2)) * (1 - space)
  const color = new Color('#000000')
    .lerp(new Color('#a6bbd5'), day)
    .lerp(new Color('#c28c7e'), twilight * 0.35)
    .lerp(new Color('#000000'), space)
  return {
    color,
    day,
    stars: Math.max(1 - day, space),
    near: visibility === 220 ? 80 : visibility * 0.75,
    far: visibility,
    fog: height < FOG_CEILING,
    space,
  }
}

/** Camera distance. Altitude must not push the fade out. */
export function mapFogRange(distance: number): { near: number; far: number } {
  return { near: distance * 0.75, far: distance }
}
