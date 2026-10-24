# Real weather

World → Environment → Weather → **Real weather** applies WeatherAPI observations to
artistic cloud coverage, rain intensity, shared horizontal wind and storm lighting.
The observation's place, condition, temperature, wind, precipitation and local observation
time appear below the switch, with a WeatherAPI attribution link.

The switch is session-only and starts off. While enabled, Rain Off / % and the cloud
controls display the automatic values and are disabled. Disable it to restore the manual
settings, including cloud style and rain/cloud linking. Observations never overwrite saved
visual preferences. Real rain follows the reported precipitation rather than the procedural
cloud mask. The sun's existing date/time setting is independent.

Geographic scenes query the player's coordinates when refreshing. The synthetic flat test
track explicitly uses Bilbao; hosts may supply `GameRuntimeOptions.weatherLocation` for
other synthetic scenes. Scenes without geography also use Bilbao. No device geolocation
permission or personal location is used.

The browser requests `/api/weather?lat=…&lon=…`. The Vite development and preview servers
install `scripts/vite-weather.ts`, which reads `WEATHERAPI_KEY` from ignored `.env.local`.
Never use a `VITE_` variable for this secret. Production hosting must provide the same
server-side endpoint; a static build alone does not contain a weather backend or API key.

Requests share a server cache for 15 minutes, grouped into 0.1-degree cells, with concurrent
requests deduplicated. The cache is capped at 128 cells and new upstream calls at 30/minute.
The client refreshes every 15 minutes while active and retries errors after one minute,
retaining the last successful weather (or manual settings if none succeeded). Switching off
or disposing the runtime cancels in-flight results. Provider error bodies and URLs are not
returned to the browser.

Rain uses a bounded logarithmic visual mapping of `precip_mm`, not a literal simulation of
millimetres. Wind converts the meteorological direction _from_ into local +X east / +Z south
advection. Thunder condition codes darken storm lighting; no lightning bolts are simulated.
Snow and ice condition codes do not produce rain because frozen precipitation is not yet
rendered. This version exposes the switch on the WebGL desktop renderer.

Validation: `live-weather.test.ts`, `weather-api.test.ts`, `live-weather.spec.ts` and GPU
`rain.spec.ts` cover mapping, polling, cancellation, cache, credential exclusion, restoration,
and rendered rain/curtains. Browser integration fixtures are synthetic; the local UI is also
verified against the live WeatherAPI endpoint.

Provider fields: [WeatherAPI realtime documentation](https://www.weatherapi.com/docs/).
