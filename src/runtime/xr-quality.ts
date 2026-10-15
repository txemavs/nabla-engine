export interface XRQualitySettings {
  handTracking: boolean
  showVest: boolean
  showHands: boolean
  scale: number
  foveation: number
  effects: boolean
  shadows: boolean
  impactLimit: number
  casingLimit: number
  sparks: boolean
  hideOwnWheels: boolean
  roadDetail: number
}
const key = 'nabla.xr.quality.v1'
export function readXRQuality(): XRQualitySettings {
  let value: Partial<XRQualitySettings> = {}
  try {
    value = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {}
  } catch {}
  const number = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
  return {
    handTracking: value.handTracking === true,
    showVest: value.showVest !== false,
    showHands: value.showHands !== false,
    impactLimit: Math.floor(number(value.impactLimit, 96, 0, 96)),
    casingLimit: Math.floor(number(value.casingLimit, 24, 0, 24)),
    sparks: typeof value.sparks === 'boolean' ? value.sparks : value.effects !== false,
    hideOwnWheels: value.hideOwnWheels === true,
    scale: number(value.scale, 0.8, 0.5, 1.5),
    foveation: number(value.foveation, 0.5, 0, 1),
    effects: typeof value.effects === 'boolean' ? value.effects : true,
    shadows: value.shadows === true,
    roadDetail: number(value.roadDetail, 8, 1, 16),
  }
}
export function saveXRQuality(value: XRQualitySettings): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}
export interface XRQualityMenu {
  rows(): { label: string; value: string }[]
  change(row: number, direction: number): void
  road(): void
  apply(): void
  status(): string
}
