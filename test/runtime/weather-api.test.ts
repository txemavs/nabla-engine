import { expect, test, vi } from 'vitest'
import { weatherApi } from '../../scripts/vite-weather.js'
import type { ViteDevServer } from 'vite'

test('proxy validates coordinates, shares cached results and never sends the key to clients', async () => {
  let handler: Function
  const plugin = weatherApi({ WEATHERAPI_KEY: 'server-test-secret' })
  const install = plugin.configureServer
  if (typeof install !== 'function') throw new Error('Missing middleware')
  ;(install as (server: ViteDevServer) => unknown)({
    middlewares: {
      use: (_path: string, fn: Function) => {
        handler = fn
      },
    },
  } as unknown as ViteDevServer)
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      location: { name: 'Irun' },
      current: {
        cloud: 100,
        precip_mm: 0,
        wind_kph: 5,
        wind_degree: 90,
        temp_c: 12,
        last_updated_epoch: 100,
        condition: { code: 1009, text: 'Overcast' },
      },
    }),
  })
  vi.stubGlobal('fetch', fetcher)
  const call = async (url: string) => {
    let body = ''
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (text: string) => {
        body = text
      },
    }
    await handler!({ method: 'GET', url }, res)
    return { status: res.statusCode, body }
  }
  try {
    expect((await call('/?lat=bad&lon=0')).status).toBe(400)
    const first = await call('/?lat=43.31&lon=-1.81')
    const second = await call('/?lat=43.32&lon=-1.82')
    expect(first.status).toBe(200)
    expect(second.body).toBe(first.body)
    expect(first.body).not.toContain('server-test-secret')
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockRejectedValue(new Error('https://provider?key=server-test-secret'))
    const failed = await call('/?lat=42&lon=-1')
    expect(failed.status).toBe(502)
    expect(failed.body).not.toContain('server-test-secret')
  } finally {
    vi.unstubAllGlobals()
  }
})
