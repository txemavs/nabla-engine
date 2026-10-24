/** One horizontal advection velocity in local world metres/second (clouds and rain). */
export const weatherWind = Object.freeze({ x: -8, z: -2.5 })

/** Independent of solar time: fixing the sun must not freeze the weather. */
export function weatherHours(seconds: number): number {
  return 12 + seconds / 3600
}

export interface RainWeather {
  wind?: { x: number; z: number }
  offset?: { x: number; z: number }
  linked: boolean
  clouds: boolean
  amount: number
  storm: number
}

/** Sky-wide lighting only; GPU cloud density supplies the spatial precipitation mask. */
export function stormStrength(rain: number, weather: RainWeather): number {
  const cloudStorm = weather.clouds ? weather.amount * weather.storm : 0
  return Math.min(1, Math.max(cloudStorm, weather.linked ? rain * cloudStorm : rain * 0.65))
}
