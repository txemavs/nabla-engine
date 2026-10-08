/**
 * Closed Euskadi Online demo (alpha): the whole game setup lives here.
 * Vite rewrites game modules to use this query; the address bar stays bare `/`.
 * nabla-engine still supports real URL params for other hosts; this repo does not use them.
 *
 * Tile zone (SHIP + parked fleet): WebMercatorQuad 15/16223/11998
 *   lat [43.33316939281733, 43.341160054123065]
 *   lon [-1.768798828125, -1.7578125]
 * Player START (S3 `car`) sits in the tile north of it (15/16223/11997).
 *
 * Ship preset id is `carrier` (assets/library/ships/container — Contenedor volador).
 * Host extras go through `?vehicles=` / installHostVehicles (engine/game/host-vehicles.ts).
 *
 * Fleet (Mari host API after nabla-engine #102):
 *   - 3 tractoras blue/red/orange (`white-truck` + color)
 *   - each followed by hitched `white-trailer` with `tow: true` (or `tow: "spawned-N"`)
 *   - many solo `white-trailer` WITHOUT tow (park-on-legs / landing gear)
 * With `?vehicles=` present, terrain-drive does NOT spawn its default car/a3/truck/carrier row.
 */

export const TILES_ROUTE = "/tiles"

/** Post-flip cinematic camera (two rolls / flips). Default on; menu can disable. */
export const FLIP_CINEMATIC = true

/** Flying container / carrier — preset id `carrier`. Inside tile 15/16223/11998. */
export const SHIP = {
  lat: 43.33815,
  lon: -1.7667,
  heading: 60,
  vehicle: "carrier",
} as const

/**
 * Player start — the `car` preset = «S3 Nabla · DSG» (assets/library/cars/a3/s3.json: AWD,
 * 7-speed DSG; engine modes since nabla-engine #157: NORMAL (D, 200 CV / 400 Nm) by default,
 * BESTIA (S, 400 CV / 520 Nm) via J › MOTOR or B). Heading 309 (north-west; headings are
 * compass degrees clockwise from north), Txema's spot from his HUD (RUMBO 309), 2026-10-09.
 * The intro descent lands on the player and the engine pre-warms the area around it, so both
 * follow START. Moving START does NOT move anything else: SHIP and the parked fleet (LOT_CENTRE stall grid)
 * are absolute coordinates, not START-relative. Only START_BIKE (the parked VFR800 beside the
 * car) is derived from START.
 * History: 2026-10-05 43.33815, -1.767318, heading 60, white-truck (~50 m west of the ship);
 * 2026-10-06 43.34372, -1.76128, heading 180, white-truck; then heading 90, car (S3) until
 * 2026-10-09.
 */
export const START = {
  lat: 43.34372,
  lon: -1.76128,
  heading: 90,
  vehicle: "car",
} as const

/**
 * PLACEHOLDER (2026-10-06): the white-truck is no longer the player vehicle. It goes parked
 * (no trailer) in the car park across the road from START, aligned with the stalls — exact GPS
 * pending from Txema. While this is `null` the truck is NOT spawned. Set it to
 * `{ lat, lon, heading }` (WGS84, compass heading of the cab) and restart euskadi-game.
 */
export const WHITE_TRUCK_PARK = null as { lat: number; lon: number; heading: number } | null

/** White-truck cab paint when parked (same `entity.color` path as the coloured tractors). */
const WHITE_TRUCK_COLOR = "#f4f5f6"

/** Three parked tractoras — cab colours blue / red / orange (`entity.color`). */
const TRUCK_COLORS = ["#2980b9", "#c0392b", "#e67e22"] as const

/** Solo trailer body colours (`entity.color`; needs presentation paint to show). */
const TRAILER_COLORS = [
  "#ecf0f1",
  "#bdc3c7",
  "#95a5a6",
  "#7f8c8d",
  "#34495e",
  "#2c3e50",
  "#1abc9c",
  "#16a085",
  "#27ae60",
  "#2ecc71",
  "#f1c40f",
  "#f39c12",
  "#e67e22",
  "#d35400",
  "#e74c3c",
  "#c0392b",
  "#9b59b6",
  "#8e44ad",
  "#3498db",
  "#2980b9",
  "#5dade2",
] as const

type HostEntry = {
  lat: number
  lon: number
  heading: number
  vehicle: "white-truck" | "white-trailer" | "vfr800"
  /** Body paint (`#rrggbb`); omit to keep the preset's own colours. */
  color?: string
  /** Hitch to previous tractor (`true`) or explicit spawned id (`"spawned-N"`). Omit for park-on-legs. */
  tow?: true | string
}

/** Compass heading of every parked tractor / trailer (degrees clockwise from north). */
const PARK_HEADING = 0

/** Centre of the solo-trailer stall block (same lot as before, west/NW of the ship). */
const LOT_CENTRE = { lat: 43.338253, lon: -1.767786 } as const

/** Lateral distance between solo trailer centres (2.55 m body + ~1.65 m gap). */
const STALL_PITCH = 4.2
/** Distance between solo rows along the heading (13.5 m body + 2.5 m gap). */
const ROW_PITCH = 16
/** Solo trailers per row, front row first. */
const ROW_STALLS = [7, 6, 5] as const
/** Lateral distance between the hitched tractor+trailer rigs. */
const RIG_PITCH = 6
/**
 * Tractor centre ahead of the solo front row, along the heading. A rig is ~17.4 m long
 * (tractor front +3.1 m, trailer tail ~-14.3 m from the tractor centre), so its tail
 * lines up with the back of the front solo row.
 */
const RIG_AHEAD = 7.5

const METRES_PER_DEGREE = 111_194.93

/**
 * Lat/lon `forward` metres along PARK_HEADING and `right` metres to the vehicle's right
 * from LOT_CENTRE. The stall grid is built in the vehicles' own frame so trailers sit side by
 * side whatever the heading. A fixed lat/lon grid (not heading-aligned) stacks 13.5 m trailers
 * on top of each other and Rapier flips them on their sides.
 */
function stall(forward: number, right: number): { lat: number; lon: number } {
  const h = (PARK_HEADING * Math.PI) / 180
  const north = forward * Math.cos(h) - right * Math.sin(h)
  const east = forward * Math.sin(h) + right * Math.cos(h)
  const lat = LOT_CENTRE.lat + north / METRES_PER_DEGREE
  const lon =
    LOT_CENTRE.lon + east / (METRES_PER_DEGREE * Math.cos((LOT_CENTRE.lat * Math.PI) / 180))
  return { lat: Number(lat.toFixed(7)), lon: Number(lon.toFixed(7)) }
}

/** Tractor only — no tow on the truck. */
function tractor(at: { lat: number; lon: number }, color: string): HostEntry {
  return { ...at, heading: PARK_HEADING, vehicle: "white-truck", color }
}

/**
 * Hitched trailer — `tow: true` binds to the previous tractor in the same list.
 * The engine moves it onto the fifth wheel, so it shares the tractor's lat/lon.
 */
function hitchedTrailer(at: { lat: number; lon: number }, color: string): HostEntry {
  return { ...at, heading: PARK_HEADING, vehicle: "white-trailer", color, tow: true }
}

/** Solo trailer — omit tow so landing gear deploys (park-on-legs). */
function soloTrailer(at: { lat: number; lon: number }, color: string): HostEntry {
  return { ...at, heading: PARK_HEADING, vehicle: "white-trailer", color }
}

function soloBlock(): HostEntry[] {
  const out: HostEntry[] = []
  const widest = Math.max(...ROW_STALLS)
  ROW_STALLS.forEach((count, row) => {
    const forward = ((ROW_STALLS.length - 1) / 2 - row) * ROW_PITCH
    for (let i = 0; i < count; i++) {
      // Rows share the right-hand edge so the rigs on the left never meet a shorter row.
      const right = ((widest - 1) / 2 - (count - 1 - i)) * STALL_PITCH
      out.push(soloTrailer(stall(forward, right), TRAILER_COLORS[out.length % TRAILER_COLORS.length]))
    }
  })
  return out
}

function rigs(): HostEntry[] {
  const frontRow = ((ROW_STALLS.length - 1) / 2) * ROW_PITCH
  const leftEdge = -((Math.max(...ROW_STALLS) - 1) / 2) * STALL_PITCH
  return TRUCK_COLORS.flatMap((color, i) => {
    const at = stall(frontRow + RIG_AHEAD, leftEdge - (i + 1) * RIG_PITCH)
    return [tractor(at, color), hitchedTrailer(at, color)]
  })
}

/**
 * Parked, unoccupied Honda VFR800FI (`vfr800` preset) next to the start car: same heading as
 * START, 2.75 m to its right (centre to centre: ~1.4 m clear between the S3 and the bike), level
 * with it — beside the S3, not in front. Derived from START along its heading, so it stays on the
 * car's right whatever START's heading. Preset paint (no color); the engine sets it on the ground.
 */
const START_BIKE_OFFSET_M = 2.75
export const START_BIKE: HostEntry = {
  ...beside(START, 0, START_BIKE_OFFSET_M),
  heading: START.heading,
  vehicle: "vfr800",
}

/** Lat/lon `forward` metres along `at.heading` and `right` metres to its right. */
function beside(
  at: { lat: number; lon: number; heading: number },
  forward: number,
  right: number,
): { lat: number; lon: number } {
  const h = (at.heading * Math.PI) / 180
  const north = forward * Math.cos(h) - right * Math.sin(h)
  const east = forward * Math.sin(h) + right * Math.cos(h)
  const lat = at.lat + north / METRES_PER_DEGREE
  const lon = at.lon + east / (METRES_PER_DEGREE * Math.cos((at.lat * Math.PI) / 180))
  return { lat: Number(lat.toFixed(7)), lon: Number(lon.toFixed(7)) }
}

/**
 * Parked fleet west/NW of the ship (same tile), all facing PARK_HEADING.
 * 3 hitched tractor+trailer rigs (colored) to the left of 18 solo trailers on landing gear
 * (rows of 7 / 6 / 5, ~4.2 m lateral pitch, ~16 m row pitch), plus START_BIKE beside the car.
 */
export const PARKED: readonly HostEntry[] = [
  ...rigs(),
  ...soloBlock(),
  // Parked white-truck (tractor only, no tow) once WHITE_TRUCK_PARK has real coordinates.
  ...(WHITE_TRUCK_PARK
    ? [{ ...WHITE_TRUCK_PARK, vehicle: "white-truck" as const, color: WHITE_TRUCK_COLOR }]
    : []),
  START_BIKE,
]

/** @deprecated Use PARKED. */
export const PARKED_TRUCKS = PARKED

/** Query string WITHOUT leading `?`. */
export function demoQuery(tilesRoute: string = TILES_ROUTE): string {
  const params = new URLSearchParams({
    terrain: tilesRoute,
    lat: String(START.lat),
    lon: String(START.lon),
    heading: String(START.heading),
    vehicle: START.vehicle,
    relief: "lidar",
    // Show road layer so runtime carriageway / roads-drape tint is visible (default -road hid it under terrain photo).
    layers: "-places",
    // Morning start + accelerated day (engine &time= / &timeSpeed=).
    time: "10:00",
    timeSpeed: "24",
  })
  params.set("vehicles", JSON.stringify([SHIP, ...PARKED]))
  return params
    .toString()
    .replace(/%2F/gi, "/")
    .replace(/%3A/gi, ":")
    .replace(/%2C/gi, ",")
}
