import { afterEach, expect, test, vi } from 'vitest'
import {
  LiveWeather,
  weatherVisuals,
  type WeatherObservation,
} from '../../src/runtime/live-weather.js'

const observation: WeatherObservation = {
  location: 'Irun',
  observedAt: 123456,
  cloud: 100,
  precipitation: 5,
  windKph: 36,
  windDegrees: 90,
  temperature: 12,
  condition: 'Rain',
  code: 1186,
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('maps observations to bounded rain and wind blowing from east to west', () => {
  const v = weatherVisuals(observation)
  expect(v.rain).toBeGreaterThan(0.5)
  expect(v.wind.x).toBeCloseTo(-10)
  expect(v.wind.z).toBeCloseTo(0)
  expect(weatherVisuals({ ...observation, precipitation: 0 }).rain).toBe(0)
  expect(weatherVisuals({ ...observation, code: 1225 }).rain).toBe(0)
  expect(weatherVisuals({ ...observation, code: 1276 }).storm).toBe(0.85)
})

test('polls only while enabled, caches 15 minutes and retains last result on failure', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => observation })
  vi.stubGlobal('fetch', fetcher)
  const weather = new LiveWeather()
  await weather.update(43, -2)
  expect(fetcher).not.toHaveBeenCalled()
  weather.setEnabled(true)
  await weather.update(43, -2)
  await weather.update(43, -2)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(weather.observation).toEqual(observation)
  vi.advanceTimersByTime(900_001)
  fetcher.mockRejectedValue(new Error('offline'))
  await weather.update(43, -2)
  expect(weather.error).toBe(true)
  expect(weather.observation).toEqual(observation)
  weather.dispose()
  expect(weather.observation).toBeNull()
})

test('an in-flight result cannot reactivate weather after disabling', async () => {
  let resolve!: (value: unknown) => void
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const weather = new LiveWeather()
  weather.setEnabled(true)
  const request = weather.update(43, -2)
  weather.setEnabled(false)
  resolve({ ok: true, json: async () => observation })
  await request
  expect(weather.observation).toBeNull()
  expect(weather.enabled).toBe(false)
})
