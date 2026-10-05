# Planet visual settings (game HUD)

Compact in-game controls for atmosphere and glare. A small HUD icon opens a
GTA Online-style tabbed window that shares the ship-monitor stylesheet
(`src/runtime/vehicle-monitor-styles.ts`). The Planeta form is built by
`createPlanetSettingsPanel` so a carrier interior monitor can host the same
root later; this release only mounts it in the HUD.

## Config keys

Pasteable values from the Planeta tab **Copy config** button (also shown live
in the panel):

| Key             | Type       | Range / values                                  | Engine API                                      |
| --------------- | ---------- | ----------------------------------------------- | ----------------------------------------------- |
| `cloudStyle`    | enum       | `artistic` or `low`                             | `GameRuntime.setCloudStyle`                     |
| `cloudAmount`   | number     | `0`-`1`                                         | `GameRuntime.setCloudWeather(amount, pressure)` |
| `cloudPressure` | number     | `0`-`1` (artistic storm / deck pressure)        | second arg of `setCloudWeather`                 |
| `lensFlare`     | number     | `0`-`1`                                         | `GameRuntime.setLensFlareAmount`                |
| `sky`           | `0` or `1` | planetary sky pass                              | `setPlanetLayers({ sky })`                      |
| `sun`           | `0` or `1` | sun disc + directional light + flare visibility | `setPlanetLayers({ sun })`                      |
| `clouds`        | `0` or `1` | cloud layers                                    | `setPlanetLayers({ clouds })`                   |
| `sea`           | `0` or `1` | ocean sheet                                     | `setPlanetLayers({ sea })`                      |

Related URL knobs already handled by the terrain demo (Hora / Mar content):

| Key         | Meaning                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| `time`      | `HH:MM` or `ahora`                                                         |
| `timeSpeed` | `1`-`24`                                                                   |
| `sea`       | sea level metres (`-5` to `50`) when used as a URL param for tide override |

### Host / demo object

```ts
runtime.setCloudStyle(config.cloudStyle)
runtime.setCloudWeather(config.cloudAmount, config.cloudPressure)
runtime.setLensFlareAmount(config.lensFlare)
runtime.setPlanetLayers({
  sky: !!config.sky,
  sun: !!config.sun,
  clouds: !!config.clouds,
  sea: !!config.sea,
})
```

`GameRuntime.planetVisualConfig()` returns the same snapshot shape for hosts
that prefer JSON over the line-oriented copy text.

## Cloud pressure modes

UI presets map to `cloudPressure`:

| Mode   | Value                     |
| ------ | ------------------------- |
| Calm   | `0`                       |
| Fair   | `0.12`                    |
| Stormy | `0.55`                    |
| Custom | whatever the slider reads |

## Lens flare

Play mode reattaches `GeographicView.lensFlare` to the game scene (it stayed
on the Studio viewer path after the Play extraction). Amount scales the
fullscreen additive pass; `0` disables the effect without hiding the sun disc.
