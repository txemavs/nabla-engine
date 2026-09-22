# World Streaming Investigation: Missing Buildings at Moderate Speed

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

| Aspect | nabla-engine | Streets GL |
|--------|--------------|-----------|
| Data source | Live Overpass queries | Prebuilt vector tiles |
| Tile size | 1,200m zones | Standard web mercator tiles |
| Data prep | Runtime OSM→geometry | Offline Planetiler pipeline |
| Caching | Browser Cache Storage | CDN + browser cache |
| Rate limits | 30s public Overpass pacing | None (static tiles) |
| Coverage | On-demand global | Pre-processed regions |

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
const cacheHit = /* check if this was from cache */
this.nextRequest = Date.now() + (cacheHit ? 50 : 250)
```

**Benefit:** Cached neighborhoods load 5× faster. Repeat visits to areas work much better.

**Risk:** None. Cache hits don't touch network.

### 4. Self-Hosted Overpass / Vector Tile Cache (HIGH IMPACT, HIGH EFFORT)

The `services/world-cache` Docker service already exists. With it configured:

```typescript
nextRemoteRequest = Date.now() + (CACHE_BASE ? 0 : 30000)  // 0 with cache!
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

1. **Parallel zone fetching** (biggest bang for buck)
2. **Prioritize player's zone** (eliminates standing-on-nothing)
3. **Reduce cache-hit delay** (improves repeat visits)
4. Document self-hosted cache setup more prominently

## Files Involved

- `src/world-stream.ts` - Zone scheduling, serialization, eviction
- `playground/world-provider.ts` - Overpass fetching, rate limiting, caching
- `playground/world-worker.ts` - Worker message handling
- `playground/world-loader.ts` - Main thread ↔ worker bridge
- `src/simulation.ts` - Terrain boundary constraint (L439-480)
- `docs/real-world.md` - Streaming architecture documentation
