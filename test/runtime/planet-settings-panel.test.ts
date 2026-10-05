import { describe, expect, it } from 'vitest'
import {
  CLOUD_PRESSURE_PRESETS,
  formatPlanetVisualConfig,
  planetVisualConfigFromRuntime,
  type PlanetSettingsRuntime,
} from '../../src/runtime/planet-settings-panel.js'

function fakeRuntime(): PlanetSettingsRuntime {
  const state = {
    sky: true,
    sun: true,
    clouds: true,
    sea: true,
    cloudStyle: 'artistic' as 'low' | 'artistic',
    cloudAmount: 0.35,
    cloudPressure: 0.12,
    lensFlareAmount: 1,
  }
  return {
    get planetLayers() {
      return { sky: state.sky, sun: state.sun, clouds: state.clouds, sea: state.sea }
    },
    setPlanetLayers(layers) {
      Object.assign(state, layers)
    },
    get cloudStyle() {
      return state.cloudStyle
    },
    setCloudStyle(style) {
      state.cloudStyle = style as 'low' | 'artistic'
    },
    get cloudAmount() {
      return state.cloudAmount
    },
    get cloudPressure() {
      return state.cloudPressure
    },
    setCloudWeather(amount, storm = 0) {
      state.cloudAmount = amount
      state.cloudPressure = storm
    },
    get lensFlareAmount() {
      return state.lensFlareAmount
    },
    setLensFlareAmount(amount) {
      state.lensFlareAmount = amount
    },
  }
}

describe('planet visual config text', () => {
  it('formats readable keys for host paste', () => {
    expect(
      formatPlanetVisualConfig({
        cloudStyle: 'artistic',
        cloudAmount: 0.35,
        cloudPressure: 0.12,
        lensFlareAmount: 1,
        sky: true,
        sun: true,
        clouds: true,
        sea: false,
      }),
    ).toBe(
      [
        'cloudStyle=artistic',
        'cloudAmount=0.35',
        'cloudPressure=0.12',
        'lensFlare=1',
        'sky=1',
        'sun=1',
        'clouds=1',
        'sea=0',
      ].join('\n'),
    )
  })

  it('reads a runtime snapshot', () => {
    const runtime = fakeRuntime()
    runtime.setCloudWeather(0.8, 0.55)
    runtime.setLensFlareAmount(0.25)
    expect(planetVisualConfigFromRuntime(runtime)).toEqual({
      cloudStyle: 'artistic',
      cloudAmount: 0.8,
      cloudPressure: 0.55,
      lensFlareAmount: 0.25,
      sky: true,
      sun: true,
      clouds: true,
      sea: true,
    })
  })

  it('keeps named pressure presets stable for host configs', () => {
    expect(CLOUD_PRESSURE_PRESETS.map((p) => [p.id, p.value])).toEqual([
      ['calm', 0],
      ['fair', 0.12],
      ['stormy', 0.55],
    ])
  })
})
