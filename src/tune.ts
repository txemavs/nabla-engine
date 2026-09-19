/**
 * World feel knobs. Shipped fallbacks live here; the live file is
 * ``/tune.js`` (``agency-django/.../static/agency/tune.js``).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/tune.ts
 *
 * Edit that file and hard-reload — no Vite. ``localStorage.AGENCY_TUNE``
 * is a JSON overlay on top (DevTools, same reload).
 */
export type AgencyTune = {
  /** Server debug mode (from DJANGO_DEBUG). Enables mesh cache-busting. */
  debug: boolean
  /** Vehicle wheel animation settings. */
  wheels: {
    /** Enable spinning wheel animation. Disable if performance is poor. */
    spin: boolean
  }
  planet: {
    zoom: number
    zoomMin: number
    zoomMax: number
    nearM: number
    midM: number
    farM: number
    walkStack: boolean
    lodMidDelta: number
    lodFarDelta: number
    lodFloor: number
    maxLayers: number
    coverZMin: number
    coverZMax: number
    tilesAcross: number
    coverHorizon: number
    ringTiles: number
    airLoM: number
    airHiM: number
    squareHiM: number
    squareZ: number
    squareRing: number
    airRing: number
    parentPad: number
    parentLayers: number
    groundParentLayers: number
    highZMax: number
    highZMin: number
    climbStep: number
    meshCeilingM: number
    lotCeilingM: number
    walkFarMinM: number
    walkFarPad: number
    walkNearMinMm: number
    walkNearPerM: number
    yardLiftMm: number
    underYardMm: number
  }
  walk: {
    gravity: number
    jumpVy: number
    maxVy: number
    coyoteS: number
    jumpBufferS: number
    groundSlack: number
    cubeMm: number
    eyeAboveHeadMm: number
    chaseBackMm: number
    chaseLiftMm: number
    landRx: number
  }
  drive: {
    nearM: number
    cabinYM: number
    chaseBackM: number
    chaseUpM: number
    farBackM: number
    farUpM: number
    pilotYM: number
    pilotBackM: number
    containerPilotUpM: number
    containerPilotFwdM: number
    pilotSideM: number
    pilotLiftMaxM: number
    pilotLiftSens: number
    seatSideM: number
    seatBackM: number
    seatHeadM: number
    topHM: number
    topHMin: number
    topHMax: number
    topWheel: number
    topMouseClimb: number
    topTiltMax: number
    topTiltSens: number
    topNadirDeg: number
    lookSens: number
    pitchMin: number
    pitchMax: number
  }
  crt: {
    standM: number
  }
  sky: {
    fadeLoMm: number
    fadeHiMm: number
  }
  space: {
    orbitAltM: number
    spaceAltM: number
    flyCeilingM: number
    orbitPeriodS: number
  }
}

export const TUNE_DEFAULTS: AgencyTune = {
  debug: false,
  wheels: {
    spin: true,
  },
  planet: {
    zoom: 18,
    zoomMin: 13,
    zoomMax: 19,
    nearM: 320,
    midM: 1600,
    farM: 5000,
    walkStack: true,
    lodMidDelta: 2,
    lodFarDelta: 4,
    lodFloor: 12,
    maxLayers: 5,
    coverZMin: 1,
    coverZMax: 14,
    tilesAcross: 6,
    coverHorizon: 1.2,
    ringTiles: 3,
    airLoM: 0,
    airHiM: 1200,
    squareHiM: 500,
    squareZ: 19,
    squareRing: 2,
    airRing: 1,
    parentPad: 1,
    parentLayers: 1,
    groundParentLayers: 2,
    highZMax: 12,
    highZMin: 8,
    climbStep: 2,
    meshCeilingM: 50_000,
    lotCeilingM: 250_000,
    walkFarMinM: 8_000,
    walkFarPad: 1.15,
    walkNearMinMm: 60,
    walkNearPerM: 50,
    yardLiftMm: 0.5,
    underYardMm: 100,
  },
  walk: {
    gravity: 20_000,
    jumpVy: -7000,
    maxVy: 80_000,
    coyoteS: 0.08,
    jumpBufferS: 0.08,
    groundSlack: 16,
    cubeMm: 440,
    eyeAboveHeadMm: 80,
    chaseBackMm: 3400,
    chaseLiftMm: 1200,
    landRx: 8,
  },
  drive: {
    nearM: 2.8,
    cabinYM: 0.54,
    chaseBackM: 5.6,
    chaseUpM: 2.6,
    farBackM: 16,
    farUpM: 7.2,
    pilotYM: 1.3,
    pilotBackM: 0.14,
    containerPilotUpM: 1,
    containerPilotFwdM: 2,
    pilotSideM: 0.36,
    pilotLiftMaxM: 1,
    pilotLiftSens: 0.004,
    seatSideM: 0.55,
    seatBackM: 0.38,
    seatHeadM: 0.52,
    topHM: 24,
    topHMin: 4,
    topHMax: 1000,
    topWheel: 0.0022,
    topMouseClimb: 0.008,
    topTiltMax: 10,
    topTiltSens: 0.08,
    topNadirDeg: 0.4,
    lookSens: 0.28,
    pitchMin: -15,
    pitchMax: 80,
  },
  crt: { standM: 1.45 },
  sky: { fadeLoMm: 1_000_000, fadeHiMm: 3_000_000 },
  space: {
    orbitAltM: 420_000,
    spaceAltM: 10_000_000,
    flyCeilingM: 11_000_000,
    orbitPeriodS: 180,
  },
}

type Plain = Record<string, unknown>

function isPlain(v: unknown): v is Plain {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

export function mergeTune<T>(base: T, over?: unknown): T {
  if (over === undefined || over === null) return base
  if (!isPlain(base) || !isPlain(over)) return over as T
  const out: Plain = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue
    out[k] = mergeTune((base as Plain)[k], v)
  }
  return out as T
}

function readLocalOverlay(): unknown {
  try {
    const raw = globalThis.localStorage?.getItem('AGENCY_TUNE')
    if (!raw) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function readWindowOverlay(): unknown {
  try {
    return (globalThis as { AGENCY_TUNE?: unknown }).AGENCY_TUNE
  } catch {
    return undefined
  }
}

let cached: AgencyTune | null = null

/** Merged knobs (defaults ← ``/tune.js`` ← localStorage). */
export function tune(): AgencyTune {
  if (cached) return cached
  cached = mergeTune(mergeTune(TUNE_DEFAULTS, readWindowOverlay()), readLocalOverlay())
  return cached
}

export function resetTuneCache(): void {
  cached = null
}
