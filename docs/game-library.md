# Game Library Mode

The Nabla Engine can run as a standalone game library without the Studio UI.
This mode loads terrain tiles statically and spawns the player directly in a
vehicle, making it suitable for deployment on static hosts like S3 or nginx.

## Quick Start

Build and deploy the game:

```bash
npm run build:game
# Output: game-dist/
```

Serve the `game-dist/` directory from any static host. The game loads terrain
tiles from pre-built manifest.json files via GET requests.

## URL Parameters

Configure the game spawn location and vehicle:

| Parameter | Default                               | Description                                                  |
| --------- | ------------------------------------- | ------------------------------------------------------------ |
| `lat`     | 43.3372                               | Spawn latitude (Zaisa, Irun)                                 |
| `lon`     | -1.7523                               | Spawn longitude                                              |
| `alt`     | 50                                    | Spawn altitude in meters                                     |
| `vehicle` | `car`                                 | Vehicle preset ID                                            |
| `tiles`   | `https://atlas.chained.world/euskadi` | Tile base URL, without the trailing `/z` (`/` = this origin) |
| `static`  | `true`                                | Use static tile mode (GET vs POST)                           |

**Example:**

```
?lat=40.4168&lon=-3.7038&vehicle=police
?tiles=https://tiles.example.org/my-set
```

## Static Tile Mode

When `static=true` (default), the game fetches tile manifests via GET requests:

```
{tilesBaseUrl}/z/{zoom}/{x}/{y}/manifest.json
{tilesBaseUrl}/z/{zoom}/{x}/{y}/{terrain}.glb
{tilesBaseUrl}/z/{zoom}/{x}/{y}/{buildings}.glb
```

`tilesBaseUrl` must **not** end in `/z`: the engine adds `z/{zoom}/{x}/{y}` itself (a base of `/z` would
request `/z/z/15/...`). The default base is the Euskadi tile set, `https://atlas.chained.world/euskadi`, so the
Z15 tile 16224/11998 is read from
`https://atlas.chained.world/euskadi/z/15/16224/11998/manifest.json`. Use `?tiles=` to point at another host.

This is compatible with S3, CloudFront, nginx, or any static file server. The planet worker checks every GLB
against the size and SHA-256 in its manifest and rejects a mismatch.

### HTTPS requirement

Serve the game page over **HTTPS** (`http://localhost` is fine for development):

- the worker uses `crypto.subtle` (GLB checksum) and the Cache API, which browsers only provide in a secure
  context;
- an `https:` page cannot load tiles from an `http:` host (mixed content); the game reports this explicitly
  instead of a bare network error.

### What the status line tells you

The loading status shows how many manifests loaded, how many are absent (not published), and how many failed after
retries. Absent tiles are detected via HTTP 404, SPA fallback (HTML 200 from Vite/dev servers), or HTTP 403/CORS
errors (common for S3 missing keys without CORS headers). True errors like timeouts retry with exponential backoff
(up to 3 attempts), then the tile is marked as permanently failed for the session.

### Robust tile loading

The game handles missing or unavailable tiles gracefully:

- **Independent loading**: Each tile is fetched independently so one failure does not block others
- **SPA fallback detection**: Dev servers returning HTML for missing paths are treated as "tile absent"
- **S3/CloudFront 403**: Access denied (often returned for missing keys) is treated as "tile absent"
- **Retry with backoff**: Transient errors (timeout, network) retry up to 3 times with exponential backoff
- **Graceful degradation**: The game starts once at least one tile loads, even if others are absent
- **Console summary**: When loading completes, absent and failed tiles are logged once (not on every retry)

If zero tiles load, the loading screen shows a clear error. If some tiles are absent, the game proceeds with
available tiles and logs a summary like `Tile loading complete: 7 loaded, 2 absent (not published)`.

### CORS Configuration

For cross-origin tile hosting, configure your CDN/bucket with appropriate CORS
headers:

```
Access-Control-Allow-Origin: *            (or the exact origin of the game page)
Access-Control-Allow-Methods: GET
```

The header must be present on manifests and GLB files, including error responses if you want the real status to
be visible (without it the browser reports only a CORS error).

## Loading Screen

The game shows a loading screen until the initial 3×3 tile grid (Z15) around
the spawn location is loaded. This ensures terrain collision is available
before the player spawns.

Tile indicators show loading progress:

- Gray: waiting
- Blue: loaded
- Purple: center (spawn) tile

## Controls

| Key     | Action                       |
| ------- | ---------------------------- |
| W/A/S/D | Drive                        |
| Space   | Brake / Handbrake            |
| C       | Cycle camera (cockpit/chase) |
| R       | Reset vehicle position       |
| Shift   | Sprint (when walking)        |

## Vehicle Presets

Available vehicle presets are defined in `assets/studio/cars/`. The default
`car` preset loads the S3 Nabla 400 CV from `assets/studio/cars/a3/s3.json`.

Custom vehicles can be added by placing JSON presets in the assets folder.
See [Creating a Vehicle](creating-a-vehicle.md) for the preset format.

## Integration

Import the engine as a library for custom game code:

```typescript
import { PlanetWorld, Simulation, SceneView, presetVehicle, createEntity } from '@nabla/engine'

// Create a scene document with geography
const document = {
  version: 1,
  name: 'MyGame',
  geography: {
    latitude: 43.3372,
    longitude: -1.7523,
    altitude: 50,
    imagery: 'offline',
    planetary: true,
  },
  entities: [createEntity('spawn', 'spawn'), presetVehicle('car', 'player-car')],
}

// Create world stream with static tiles
const world = new PlanetWorld(
  origin,
  onChange,
  setupMaterial,
  'https://atlas.chained.world/euskadi', // tilesBaseUrl (no trailing /z)
  '/prepare', // apiUrl (unused in static mode)
  'static', // discoveryMode
)

// Create simulation
const sim = new Simulation(document, {
  planetaryTerrain: true,
})
sim.startInVehicle('player-car')
```

## Build Output

The `game-dist/` directory contains:

- `index.html` - Entry point
- `assets/` - JS bundles, workers, WASM modules
- Copies of `assets/` (sprites, brands, vehicle models)

Deploy the entire directory to your static host. For S3 deployment:

```bash
aws s3 sync game-dist/ s3://your-bucket/ --delete
```

## Development

Run the game in development mode:

```bash
npm run dev:game
# Opens at http://localhost:5174
```

Configure tile proxying in `vite.game.config.ts` for local development with
a remote tile server.

## Tile Preparation

Pre-built tiles must exist at the configured base URL. Use the world-cache
services to generate tiles:

1. Generate tiles with the world-cache pipeline
2. Upload to your static host maintaining the `z/{zoom}/{x}/{y}/` structure
3. Each tile directory needs:
   - `manifest.json` (tile metadata and GLB paths)
   - `terra-{zoom}-{x}-{y}-{timestamp}.glb` (terrain)
   - `build-{zoom}-{x}-{y}-{timestamp}.glb` (buildings)

See [World cache operations](world-cache-operations.md) for tile generation.
