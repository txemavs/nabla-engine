export interface WeatherObservation {
  location: string
  observedAt: number
  cloud: number
  precipitation: number
  windKph: number
  windDegrees: number
  temperature: number
  condition: string
  code: number
}

export function weatherVisuals(data: WeatherObservation) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  // Frozen precipitation has no renderer yet; do not misrepresent it as rain.
  const frozen = [
    1066, 1069, 1072, 1114, 1117, 1147, 1168, 1171, 1198, 1201, 1204, 1207, 1210, 1213, 1216, 1219,
    1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264, 1279, 1282,
  ].includes(data.code)
  const rain = frozen ? 0 : clamp(Math.log1p(Math.max(0, data.precipitation)) / Math.log(11))
  const storm = [1087, 1273, 1276, 1279, 1282].includes(data.code) ? 0.85 : rain * 0.7
  const radians = (data.windDegrees * Math.PI) / 180
  const speed = Math.min(60, Math.max(0, data.windKph / 3.6))
  return {
    rain,
    cloud: clamp(data.cloud / 100),
    storm,
    wind: { x: -Math.sin(radians) * speed, z: Math.cos(radians) * speed },
  }
}

/** One request immediately, then every 15 minutes. Disable/dispose cancels pending results. */
export class LiveWeather {
  enabled = false
  observation: WeatherObservation | null = null
  error = false
  loading = false
  private next = 0
  private request?: AbortController
  setEnabled(value: boolean): void {
    this.enabled = value
    this.request?.abort()
    this.request = undefined
    this.loading = false
    this.observation = null
    this.error = false
    this.next = 0
  }
  get needsUpdate(): boolean {
    return this.enabled && !this.loading && Date.now() >= this.next
  }
  async update(latitude: number, longitude: number): Promise<void> {
    if (!this.enabled || this.loading || Date.now() < this.next) return
    const request = new AbortController()
    this.request = request
    this.loading = true
    try {
      const response = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`, {
        signal: request.signal,
      })
      if (!response.ok) throw new Error('Weather unavailable')
      const data = (await response.json()) as WeatherObservation
      if (
        ![
          data.cloud,
          data.precipitation,
          data.windKph,
          data.windDegrees,
          data.observedAt,
          data.code,
        ].every(Number.isFinite)
      )
        throw new Error('Invalid weather')
      if (this.request !== request) return
      this.observation = data
      this.error = false
      this.next = Date.now() + 900_000
    } catch {
      if (this.request !== request) return
      this.error = true
      this.next = Date.now() + 60_000
    } finally {
      if (this.request === request) this.loading = false
    }
  }
  dispose(): void {
    this.setEnabled(false)
  }
}
