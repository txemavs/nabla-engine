# World Streaming Investigation: Missing Buildings at Moderate Speed

## Update: duplicate tile planning (#38)

The scheduling snapshot below predates the current concurrent loader. For the
current implementation, WorldStream.update shares one install plan for both
wanted and prefetch filtering. Preparation reuses it at the same 15-second
horizon. A distinct horizon needs a second evaluation because its corridor,
ranking and 24-tile cutoff differ; it cannot safely be sliced from the other plan.
Disabled preparation performs one evaluation, and orbital updates perform none.
Tests compare exact coverage and ordering against the previous algorithm and
assert these evaluation counts.

This completes the redundant-call part of #37, not its quantized scheduling or
fingerprint work. The reduction applies to planner CPU, not total frame time or
rendering cost; no threefold overall speedup is claimed.

## Follow-up audit: repeated work in the current implementation

- Cache the last tile plan by exact position, velocity and horizon values. Input
  tuples are copied into the cache key, so in-place vector mutation invalidates it.
  Retries, scheduling and eviction continue on every update; a cached plan does
  not short-circuit the rest of the stream state machine.
- Compute each tile's sorting score once instead of recalculating distances during
  every comparator call. Coverage, ordering and visual quality are unchanged.
- Emit status only when its text changes, including asynchronous load/error states.
- Extract a resident tile once during startup for baseline serialization and
  fingerprint comparison. Traverse descendant IDs through a child index rather
  than rescanning the whole scene once per hierarchy level.
- Share one editor snapshot across outliner, portal-registry and cursor refresh.
  Previously each independently cloned the same scene geometry.

This is exact-input reuse, not the position/speed/heading quantization proposed
in #37. Preparation callbacks still run so provider retries/polling can progress.
Expensive fingerprints on eviction remain: they protect edited zones and cannot
be dropped safely without replacing that invariant. Large imports, individual
mesh creation, batch rebuilding and GPU work still merit profiling. These changes
make no claim about a measured aggregate FPS multiplier.

## Problem Summary

When driving at moderate speed, zones sometimes appear empty (no buildings) even though OSM data exists for those locations. This is a streaming latency/scheduling problem, not a visual quality issue.

## Root Causes (Ranked by Impact)

### 1. Sequential Zone Loading (CRITICAL)

**Location:** `src/world-stream.ts:100-155`

The world stream processes **one zone at a time**:

```typescript
/** One request at a time. Edited/saved zones stay pinned; untouched far zones are evicted. */
export class WorldStream {
  private busy: { key: string; controller: AbortController } | null = null
  // ...
  update(...) {
    // ...
    if (this.busy || now < this.nextRequest) return  // <- blocks until previous completes
```

At moderate speed (e.g. 50 km/h ≈ 14 m/s), crossing a 1,200m zone takes ~85 seconds. However, with sequential loading, filling the wanted 3×3 neighborhood (9 zones) plus corridor (up to 24 total) requires multiple serial round-trips.

**Why this causes holes:** If the player drives through a zone while its OSM fetch is queued behind another zone's request, they arrive at empty terrain. The terrain heightfield loads, but buildings load as part of the same atomic zone fetch.

### 2. Public Overpass Rate Limiting (HIGH)

**Location:** `playground/world-provider.ts:231`

```typescript
nextRemoteRequest = Date.now() + (CACHE_BASE ? 0 : 30000)
```

Without the private cache, each uncached OSM request incurs a **30-second pacing delay**. Combined with sequential loading:

- Zone 1: fetch (2-5s network) → 30s delay
- Zone 2: fetch → 30s delay
- Zone 3: fetch → 30s delay
- ...

**Result:** 9 adjacent zones require ~4-5 minutes minimum to populate. At 50 km/h, you'd travel ~3.5 km in that time, leaving the entire area behind.

### 3. Post-Completion Scheduling Delay (MEDIUM)

**Location:** `src/world-stream.ts:227`

```typescript
.finally(() => {
  if (this.busy?.controller === controller) this.busy = null
  this.nextRequest = Math.max(this.nextRequest, Date.now() + 250)  // <- 250ms gap
})
```

Even for cached zones (browser Cache Storage hits), there's a **250ms minimum gap** between zone installations. With 9 zones to load, that's 2.25 seconds of pure scheduling overhead.

### 4. Player Update Interval (LOW)

**Location:** `playground/main.ts:1296`

```typescript
if (worldStream && !document.hidden && (!streamSample || now - streamSample.at > 500)) {
```

The streaming update runs at most every **500ms**. While the corridor prefetch compensates, rapid direction changes or stop-and-go driving can leave the scheduler with stale position info.

### 5. Terrain Boundary Constraint (BY DESIGN - NOT A BUG)

**Location:** `src/simulation.ts:439-480`

```typescript
private constrainTerrainBoundary(): void {
  // ... constrains vehicle to 8m inside terrain edge when no adjacent zone exists
  if (!nearest || nearest.distance < 1e-6 || b.position.y > nearest.height + 20) continue
  if (Math.abs(b.position.x - nearest.point.x) > 1e-6) b.velocity.x = 0
```

This is **intentional safety behavior**: vehicles are stopped 8m before an unloaded zone edge rather than falling into the void. However, when streaming is slow, this creates a "wall" effect where the player can't progress despite visible terrain ahead.

## Comparison with Streets GL

Streets GL avoids these problems through fundamentally different architecture:

| Aspect      | nabla-engine               | Streets GL                  |
| ----------- | -------------------------- | --------------------------- |
| Data source | Live Overpass queries      | Prebuilt vector tiles       |
| Tile size   | 1,200m zones               | Standard web mercator tiles |
| Data prep   | Runtime OSM→geometry       | Offline Planetiler pipeline |
| Caching     | Browser Cache Storage      | CDN + browser cache         |
| Rate limits | 30s public Overpass pacing | None (static tiles)         |
| Coverage    | On-demand global           | Pre-processed regions       |

**Key insight:** Streets GL's tiles at `tiles.streets.gl/vector/{z}/{x}/{y}` are preprocessed. A browser can request 50+ tiles/second because they're served from CDN, not computed live.

## Why Buildings Are Missing Under the Car at Moderate Speed

**The primary cause is the combination of:**

1. **Sequential loading** means only one zone loads at a time
2. **30s Overpass pacing** without cache creates multi-minute delays
3. **No prioritization** of the zone containing the player vs. distant zones
4. **Atomic zone installation** means terrain and buildings arrive together (if either is delayed, both are)

**Scenario:** Player at zone (0,0) border heading into zone (1,0):

1. WorldStream wants zones: `["1_0", "0_1", "1_1", "2_0", ...]` (24 total)
2. First uncached zone `"1_0"` starts loading
3. Public Overpass takes 3-5 seconds + elevation
4. Player crosses into (1,0) while request is in-flight
5. Zone (1,0) arrives but player has already driven 200-300m into it
6. Zone (2,0) won't even start until `1_0` completes + 250ms + (30s if not cached)
7. Player hits the 8m boundary constraint at edge of (1,0)

**Result:** Empty terrain under the player, visible "wall" stopping progress.

## Fixes Ranked by Impact

### 1. Parallel Zone Fetching (HIGH IMPACT)

Allow 2-4 concurrent zone requests instead of serializing all 24 wanted zones.

```typescript
// Example: max 3 concurrent requests
private readonly inFlight = new Map<string, AbortController>()
private readonly maxConcurrent = 3
```

**Benefit:** 3× faster neighborhood population. Player's zone + immediate neighbors load simultaneously.

**Risk:** Low. Browser handles concurrent requests; Overpass rate limit is per-endpoint, not per-connection. The 30s pacing already handles Overpass politeness.

### 2. Prioritize Player's Current Zone (HIGH IMPACT)

When the player crosses into an unloaded zone, that zone should jump to front of queue and preempt less critical distant prefetch.

```typescript
// In wantedWorldTiles or WorldStream.update:
const playerTile = worldTileAt(position)
const playerKey = worldTileKey(...playerTile)
if (!this.resident.has(playerKey)) {
  // Cancel distant prefetch, start player zone immediately
}
```

**Benefit:** Eliminates "standing on empty terrain" because player's zone is always highest priority.

**Risk:** May cause more cancelled requests for fast travel. Worth it.

### 3. Reduce Post-Completion Delay for Cache Hits (MEDIUM IMPACT)

The 250ms gap is conservative. Cache hits (browser Cache Storage) can use a shorter interval.

```typescript
const cacheHit =
  /* check if this was from cache */
  (this.nextRequest = Date.now() + (cacheHit ? 50 : 250))
```

**Benefit:** Cached neighborhoods load 5× faster. Repeat visits to areas work much better.

**Risk:** None. Cache hits don't touch network.

### 4. Self-Hosted Overpass / Vector Tile Cache (HIGH IMPACT, HIGH EFFORT)

The `services/world-cache` Docker service already exists. With it configured:

```typescript
nextRemoteRequest = Date.now() + (CACHE_BASE ? 0 : 30000) // 0 with cache!
```

**Benefit:** Eliminates 30s delays entirely. Cold starts still require Overpass, but the cache serializes upstream requests.

**Risk:** Requires infrastructure. Documentation already exists in `services/world-cache/README.md`.

### 5. Progressive Zone Loading (MEDIUM IMPACT, MEDIUM EFFORT)

Split zone loading: terrain first (fast), then buildings. This way:

1. Player can drive on terrain immediately
2. Buildings pop in as they complete
3. No hard boundary wall for missing buildings

**Benefit:** Smooth driving experience even with slow building data.

**Risk:** Visual pop-in. May need fade-in or loading indicators.

### 6. Show Loading State vs. Empty Ground (LOW IMPACT, LOW EFFORT)

Currently, missing zones appear as void/boundary. Adding a visual "loading" indicator or transparent placeholder mesh would communicate progress.

**Benefit:** User understands system is working, not broken.

**Risk:** None.

## Recommended Implementation Order

1. **Parallel zone fetching** (biggest bang for buck) ✅ IMPLEMENTED
2. **Prioritize player's zone** (eliminates standing-on-nothing) ✅ IMPLEMENTED
3. **Reduce cache-hit delay** (improves repeat visits) ✅ IMPLEMENTED (100ms)
4. Preprocessed tiles or regional extracts (see below)

---

## Preprocessing Strategy: From Demand Cache to Offline Tiles

### Current world-cache Architecture

**Location:** `services/world-cache/server.py`

The Docker cache stores:

| Data         | Format              | Storage Key                   |
| ------------ | ------------------- | ----------------------------- |
| OSM features | Raw Overpass JSON   | `sha256("osm:" + query_body)` |
| Elevation    | Raw Esri LERC bytes | `sha256("elevation:/12/y/x")` |

**Flow:**

```
Browser → world-cache (Docker) → Overpass/Esri → disk cache
                                      ↑
                            30s pacing, 60s failure cooldown
```

The cache is **demand-driven**: first request for a zone fetches from upstream and caches; subsequent requests are instant cache hits. But cold regions still hit Overpass with all its rate limits.

**What the client receives:**

```typescript
// playground/world-provider.ts creates WorldExtract:
{
  name: string,
  origin: GeoPoint,
  terrain: { columns: 121, rows: 121, spacing: 10, heights: number[] },
  features: MapFeature[],  // normalized from Overpass elements
  source: { retrievedAt, osm, elevation }
}
```

This JSON is cached in browser Cache Storage (`nabla-world-v1`) for 30 days.

### Option A: Pre-Baked Zone JSON (Smallest Path)

**Concept:** Generate the same `WorldExtract` JSON offline for a region, serve statically.

**Important caveat:** Baking pre-computes _OSM feature data_, not scene geometry. The
browser still fetches live elevation from Esri and builds the full scene (terrain
heightfields, building meshes, road geometry) at runtime. Baking eliminates Overpass
network latency and rate-limit delays, but does not skip the client-side geometry
generation work. For large/dense zones, there will still be a brief hitch as the
browser constructs meshes from the baked JSON.

**Process:**

1. Download OSM extract for region (e.g., spain-latest.osm.pbf from Geofabrik)
2. Run a script that:
   - Iterates over 1,200m grid cells
   - Extracts buildings/roads/trees using osmium or similar
   - Fetches elevation from Esri (can be parallelized, no rate limit for bulk)
   - Outputs one JSON file per zone: `zones/43.3/-1.8/0_0.json`
3. Serve via nginx/CDN from chained.world
4. Client checks static endpoint before falling back to live Overpass

**Client changes:**

```typescript
// playground/world-provider.ts
const STATIC_ZONES = import.meta.env.VITE_STATIC_ZONES_URL // e.g., https://chained.world/nabla-zones
if (STATIC_ZONES) {
  const staticUrl = `${STATIC_ZONES}/${origin.latitude.toFixed(1)}/${origin.longitude.toFixed(1)}/${key}.json`
  const response = await fetch(staticUrl)
  if (response.ok) return response.json() as WorldExtract
}
// Fall back to live Overpass...
```

**Pros:**

- Minimal client changes (same WorldExtract format)
- No new dependencies
- Works with existing browser cache
- Can pre-bake just Irun/Basque region initially

**Cons:**

- Larger file sizes than vector tiles (JSON + full coordinate precision)
- Regeneration required for OSM updates
- Custom grid system (not standard tile pyramid)

**Estimated storage:** ~50-200 KB per zone × ~1,000 zones for Irun area ≈ 50-200 MB

### Option B: Planetiler Vector Tiles (Streets GL Style)

**Concept:** Run Planetiler to produce MVT/PBF tiles with preprocessed building heights, roof types, materials.

**Planetiler overview:**

- Java tool that processes OSM PBF → vector tiles
- Streets GL uses a [modified Planetiler profile](https://github.com/StrandedKitty/streets-gl/tree/dev/tile-processing)
- Outputs standard MVT tiles at web mercator zoom levels
- Can embed derived fields: `height`, `minHeight`, `levels`, `roofShape`, `color`, `material`

**Process for chained.world:**

```bash
# Download regional extract
wget https://download.geofabrik.de/europe/spain-latest.osm.pbf

# Run Planetiler with Streets GL profile (or custom nabla profile)
java -jar planetiler.jar \
  --osm-path=spain-latest.osm.pbf \
  --output=spain-tiles.mbtiles \
  --profile=nabla-buildings

# Serve via tileserver-gl or nginx with pmtiles on chained.world
```

**Client changes:**

```typescript
// New: playground/vector-tile-provider.ts
import { VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'

const TILE_URL = import.meta.env.VITE_VECTOR_TILES_URL // https://chines.pol/tiles/{z}/{x}/{y}.pbf

export async function loadVectorTile(z: number, x: number, y: number): Promise<MapFeature[]> {
  const response = await fetch(`${TILE_URL}/${z}/${x}/${y}.pbf`)
  const buffer = await response.arrayBuffer()
  const tile = new VectorTile(new Protobuf(buffer))

  const features: MapFeature[] = []
  const buildings = tile.layers['buildings']
  for (let i = 0; i < buildings.length; i++) {
    const f = buildings.feature(i)
    features.push({
      id: `way/${f.properties.osmId}`,
      tags: {
        building: 'yes',
        height: f.properties.height,
        'building:levels': f.properties.levels,
        'roof:shape': f.properties.roofShape,
        'building:colour': f.properties.color,
      },
      rings: [{ role: 'outer', coordinates: f.loadGeometry() }],
    })
  }
  return features
}
```

**Additional work:**

- Create nabla-specific Planetiler profile (or adapt Streets GL's)
- Handle coordinate transform (MVT uses tile-local coords)
- Merge elevation separately (MVT doesn't include terrain heights)
- Update zone grid to align with or bridge from tile pyramid

**Pros:**

- Compact binary format (~10× smaller than JSON)
- Standard ecosystem (tileserver-gl, pmtiles, CDN-friendly)
- Same preprocessed data Streets GL uses
- Can support multiple zoom levels

**Cons:**

- Significant client refactor (new tile coordinate system)
- Need to merge with elevation pipeline
- MVT doesn't include Esri elevation; still need separate fetch
- Custom Planetiler profile development

**Estimated storage:** ~1-5 GB for Spain at useful zoom levels

### Option C: Hybrid — PMTiles + Pre-Baked Elevation

**Concept:** Use PMTiles (single-file tile archive) for buildings, pre-bake elevation grids.

```
chained.world/
├── spain-buildings.pmtiles     # Planetiler output, served via range requests
├── elevation/
│   ├── 12/1499/2027.lerc      # Pre-fetched Esri tiles
│   └── ...
```

Client loads PMTiles directly in browser (no tile server needed), combines with static elevation.

### Comparison

| Approach          | Client Work | Server Work             | Storage        | Update Freq |
| ----------------- | ----------- | ----------------------- | -------------- | ----------- |
| A: Zone JSON      | Minimal     | Script + nginx          | ~200 MB/region | Manual      |
| B: Planetiler MVT | Significant | Planetiler + tileserver | ~2 GB/country  | Weekly      |
| C: PMTiles hybrid | Moderate    | Planetiler + preprocess | ~3 GB/country  | Weekly      |

### Recommended Path

1. **Immediate (done):** Parallel loading + player prioritization
2. **Short-term:** Option A for Irun region
   - Pre-bake zone JSON for 50×50 km around Irun
   - Serve from chained.world as static files
   - Zero client changes beyond URL config
3. **Medium-term:** Option C for Spain/Europe
   - Run Planetiler for country extracts on chained.world
   - Serve PMTiles + pre-baked elevation
   - Refactor client to read MVT
4. **Never:** Depend on tiles.streets.gl — always self-host on chained.world

### Pre-Baking Script Sketch (Option A)

```python
#!/usr/bin/env python3
"""Pre-bake zone JSON for a region. Requires osmium, requests."""
import json, os, requests
from osmium import SimpleHandler

ORIGIN = (43.32969, -1.819606, 28.253)  # Irun Ventas
ZONE_SIZE = 1200
GRID_RADIUS = 20  # ±20 zones = 48km coverage

class BuildingHandler(SimpleHandler):
    def __init__(self, bounds):
        super().__init__()
        self.bounds = bounds
        self.features = []

    def way(self, w):
        if not w.tags.get('building'): return
        coords = [(n.lon, n.lat) for n in w.nodes]
        if not self.in_bounds(coords): return
        self.features.append({
            'id': f'way/{w.id}',
            'tags': dict(w.tags),
            'rings': [{'role': 'outer', 'coordinates': coords}]
        })

def generate_zone(x, z, osm_data, output_dir):
    # ... extract features for zone, fetch elevation, output JSON
    pass

if __name__ == '__main__':
    for x in range(-GRID_RADIUS, GRID_RADIUS + 1):
        for z in range(-GRID_RADIUS, GRID_RADIUS + 1):
            generate_zone(x, z, osm_data, 'output/zones')
```

---

---

## Zone-Scoped Authoring: Server-Side Override Layer

### Problem

Bridges and tunnels are explicitly omitted from OSM import (`src/real-world.ts:154-156`):

```typescript
if (
  ['construction', 'proposed', 'steps'].includes(tags.highway) ||
  tags.bridge === 'yes' ||
  tags.tunnel === 'yes'
)
  continue
```

This is intentional — bridges/tunnels need stacked surfaces (multiple drivable levels), not terrain-draped roads. But it leaves holes in the road network.

The user needs to **author corrections** for a zone (e.g., draw a missing bridge in Irun) and have those corrections:

1. Persist on chained.world (not OpenStreetMap)
2. Merge with the base OSM layer at runtime
3. Survive tile rebuilds (match by stable ID / geo anchor)

### Architecture

```
chained.world/
├── zones/                          # Preprocessed base (Option A/C)
│   └── 43.3/-1.8/0_0.json         # Read-only OSM-derived
├── overrides/                      # Zone-scoped corrections
│   └── 43.3/-1.8/0_0.patch.json   # Authored additions/edits/hides
└── api/
    └── POST /override/{zone}       # Save patch from editor
```

**Override patch schema:**

```typescript
interface ZoneOverride {
  zone: string // "0_0"
  origin: GeoPoint // Geographic anchor
  version: number // Increment on save
  createdAt: string
  updatedAt: string
  entries: OverrideEntry[]
}

interface OverrideEntry {
  action: 'add' | 'edit' | 'hide'
  // For edits/hides: match existing OSM feature
  sourceId?: string // "way/123456" or "relation/789"
  sourceFingerprint?: string // Content hash for conflict detection
  // For adds: new authored geometry
  entity?: Partial<Entity> // Bridge solid, tunnel, etc.
  // Geographic anchor (survives coordinate shifts)
  anchor: {
    latitude: number
    longitude: number
    altitude: number
  }
}
```

### Nabla Studio UX Flow

Nabla Studio is the existing playground app (`playground/main.ts`) — the «Nabla · Distrito cero» UI with solid editor, Irún Ventas travel, etc. Zone overrides extend this existing app:

1. **Load zone:** Existing streamer fetches base from chained.world; add override fetch
2. **Visualize:** Existing scene view renders base + override entities (bridges show up)
3. **Edit modes:** Existing solid editor already supports:
   - **Add bridge:** Draw solid geometry at elevation, mark as `action: 'add'`
   - **Hide feature:** Select OSM entity → new "hide from base" action
   - **Edit feature:** Existing property editing → detect as override
4. **Save:** New endpoint: POST patch to chained.world (vs. existing localStorage save)
5. **Conflict:** If base changed (new OSM data), flag entries with stale fingerprint

### Runtime Merge

```typescript
// playground/world-provider.ts
async function loadWorldTile(origin, key, signal): Promise<Entity[]> {
  const base = await fetchBase(origin, key, signal) // OSM-derived
  const override = await fetchOverride(origin, key, signal) // chained.world patch

  const merged = base.entities.filter(
    (e) => !override.entries.some((o) => o.action === 'hide' && o.sourceId === e.source?.id),
  )

  for (const entry of override.entries) {
    if (entry.action === 'add' && entry.entity) {
      merged.push(entry.entity)
    } else if (entry.action === 'edit' && entry.sourceId) {
      const target = merged.find((e) => e.source?.id === entry.sourceId)
      if (target) Object.assign(target, entry.entity)
    }
  }

  return merged
}
```

### Bridges/Tunnels: Geometry & Physics Requirements

Bridges and tunnels need **stacked drivable surfaces**, not terrain heightfields:

| Feature      | Current                 | Required                      |
| ------------ | ----------------------- | ----------------------------- |
| Road surface | Terrain-draped polyline | Solid mesh at fixed elevation |
| Collider     | Heightfield (2D)        | 3D convex hull / trimesh      |
| Under-bridge | N/A                     | Separate lower surface        |
| Tunnel       | N/A                     | Enclosed tube with entry/exit |

**Minimum viable bridge:**

```typescript
const bridge = createEntity('override-bridge-irun-1', 'solid', [x, y, z])
bridge.geometry = {
  vertices: [...],  // Deck polygon extruded
  edges: [...],
  faces: [...]
}
bridge.size = [width, thickness, length]
bridge.source = {
  provider: 'override',
  id: 'bridge/irun-1',
  retrievedAt: '2026-09-22',
  tags: { highway: 'primary', bridge: 'yes' }
}
```

The solid editor already supports this — the work is:

1. Bridge-specific drawing helpers (span between two road endpoints)
2. Physics: ensure vehicle wheels contact bridge deck, not terrain underneath
3. Visual: render road surface texture on bridge deck

### Ranked Implementation Plan

| Phase | Work                                                             | Complexity |
| ----- | ---------------------------------------------------------------- | ---------- |
| **0** | ✅ Parallel streaming + player prioritization                    | Done       |
| **1** | Pre-baked zone JSON for Irun (Option A)                          | Low        |
| **2** | Override API endpoint on chained.world                           | Low        |
| **3** | Editor: load base + override, show combined                      | Medium     |
| **4** | Extend existing solid editor: "save override to server" action   | Medium     |
| **5** | First bridge: hand-author one Irun span in existing solid editor | Low        |
| **6** | Bridge physics: deck collision separate from terrain             | Medium     |
| **7** | Bridge drawing helpers in existing solid editor                  | Medium     |
| **8** | Tunnel geometry + portal-like entry/exit                         | High       |

### Smallest Vertical Slice (Phase 1-5)

**Goal:** Persist a hand-authored bridge override for one Irun span.

1. Add `overrides/` directory to chained.world static serving
2. Create `0_0.patch.json` with one bridge entity (hand-drawn in existing solid editor)
3. Modify `loadWorldTile` to fetch and merge override
4. Drive over the bridge in Nabla Studio

This proves the architecture by extending the existing playground, not building a new editor.

---

## Files Involved

- `src/world-stream.ts` - Zone scheduling, serialization, eviction
- `playground/world-provider.ts` - Overpass fetching, rate limiting, caching
- `playground/world-worker.ts` - Worker message handling
- `playground/world-loader.ts` - Main thread ↔ worker bridge
- `src/simulation.ts` - Terrain boundary constraint (L439-480)
- `src/real-world.ts` - OSM feature parsing, bridge/tunnel exclusion (L154-156)
- `src/scene.ts` - Entity schema including `source` field
- `docs/real-world.md` - Streaming architecture documentation
- `services/world-cache/server.py` - Docker cache implementation
