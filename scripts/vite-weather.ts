import type { Plugin, ViteDevServer } from 'vite'

/** Server-only credentials and shared 15 minute cache; never forward provider errors/URLs. */
export function weatherApi(env: Record<string, string>): Plugin {
  const cache = new Map<string, { until: number; value: unknown }>()
  const pending = new Map<string, Promise<unknown>>()
  let windowStart = 0
  let calls = 0
  const install = (server: Pick<ViteDevServer, 'middlewares'>) => {
    server.middlewares.use('/api/weather', async (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      const fail = (status: number, error: string) => {
        res.statusCode = status
        res.end(JSON.stringify({ error }))
      }
      if (req.method !== 'GET') return fail(405, 'GET required')
      if (!env.WEATHERAPI_KEY) return fail(503, 'Weather service is not configured')
      const url = new URL(req.url ?? '/', 'http://localhost')
      const lat = Number(url.searchParams.get('lat'))
      const lon = Number(url.searchParams.get('lon'))
      if (
        !url.searchParams.has('lat') ||
        !url.searchParams.has('lon') ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        return fail(400, 'Invalid coordinates')
      // Nearby players share one observation (~10 km cells).
      const cell = `${lat.toFixed(1)},${lon.toFixed(1)}`
      const hit = cache.get(cell)
      if (hit && hit.until > Date.now()) {
        res.end(JSON.stringify(hit.value))
        return
      }
      try {
        let request = pending.get(cell)
        if (!request) {
          if (Date.now() - windowStart > 60_000) {
            windowStart = Date.now()
            calls = 0
          }
          if (++calls > 30) return fail(429, 'Weather request limit; retry later')
          request = (async () => {
            const endpoint = new URL('https://api.weatherapi.com/v1/current.json')
            endpoint.search = new URLSearchParams({
              key: env.WEATHERAPI_KEY,
              q: cell,
              aqi: 'no',
            }).toString()
            const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) })
            if (!response.ok) throw new Error('Provider unavailable')
            const data = await response.json()
            const c = data.current
            if (
              !c ||
              ![
                c.cloud,
                c.precip_mm,
                c.wind_kph,
                c.wind_degree,
                c.temp_c,
                c.last_updated_epoch,
                c.condition?.code,
              ].every(Number.isFinite)
            )
              throw new Error('Invalid observation')
            const value = {
              location: String(data.location?.name ?? cell),
              observedAt: c.last_updated_epoch * 1000,
              cloud: c.cloud,
              precipitation: c.precip_mm,
              windKph: c.wind_kph,
              windDegrees: c.wind_degree,
              temperature: c.temp_c,
              condition: String(c.condition.text),
              code: c.condition.code,
            }
            if (cache.size >= 128) cache.delete(cache.keys().next().value!)
            cache.set(cell, { until: Date.now() + 900_000, value })
            return value
          })()
          pending.set(cell, request)
        }
        const value = await request
        res.end(JSON.stringify(value))
      } catch {
        fail(502, 'WeatherAPI unavailable; retry later')
      } finally {
        pending.delete(cell)
      }
    })
  }
  return { name: 'weather-api', configureServer: install, configurePreviewServer: install }
}
