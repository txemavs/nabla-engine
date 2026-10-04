# Engine browser regressions

`npm run test:e2e` starts the minimal Vite host on port 5191. These rendering
tests cover wheel geometry/budgets, building picking, ground shadows, metal
reflections and altitude fog without loading Studio. Fixtures use the same Three
instance as Engine. Private source imports are intentional implementation tests,
not consumer API examples. CommonJS dependencies are prebundled explicitly so
late dependency discovery cannot reload a page during measurement.

Editor desktop/cursor journeys run in `txemavs/nabla-studio`. Remaining historical
journeys are preserved in that repository's `legacy/e2e`, outside active CI until
their obsolete controls/source imports are ported. This suite is not a claim that
all historical browser tests pass. The flat game remains the gameplay smoke host.
