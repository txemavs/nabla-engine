/**
 * OpenStreetMap rules used when a district becomes a scene.
 *
 * Colours turn `building:colour` and `roof:colour` into #RRGGBB.
 * Tags lists which OSM keys are kept on an entity; addresses stay in the extract.
 *  */

// --- Colours -----------------------------------------------------------------

/** CSS colour names plus the OSM names that are not in that list. */
const OSM_COLOR_NAMES: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  grey: '#808080',
  gray: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  red: '#ff0000',
  olive: '#808000',
  yellow: '#ffff00',
  green: '#008000',
  lime: '#00ff00',
  teal: '#008080',
  aqua: '#00ffff',
  cyan: '#00ffff',
  navy: '#000080',
  blue: '#0000ff',
  purple: '#800080',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  orange: '#ff8000',
  brown: '#804000',
  pink: '#ffc0cb',
  beige: '#f5f5dc',
  cream: '#fffdd0',
  tan: '#d2b48c',
  terracotta: '#e2725b',
  brick: '#cb4154',
  salmon: '#fa8072',
}

/** `building:colour` / `roof:colour`: hex or a known name, otherwise `fallback`. */
export function normalizeColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const trimmed = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1)
    return `#${r}${r}${g}${g}${b}${b}`
  }
  const named = Object.hasOwn(OSM_COLOR_NAMES, trimmed) ? OSM_COLOR_NAMES[trimmed] : undefined
  if (named) return named
  return fallback
}

// --- Tags --------------------------------------------------------------------

/** Keys copied onto the entity. Address, contact and history stay in the raw extract. */
const structural = new Set([
  'type',
  'building',
  'height',
  'min_height',
  'levels',
  'highway',
  'lanes',
  'width',
  'bridge',
  'tunnel',
  'layer',
  'railway',
  'gauge',
  'natural',
  'landuse',
  'leisure',
  'water',
  'waterway',
  'place',
  'surface',
  'oneway',
  'maxspeed',
])

/** Structural keys, plus every `roof:*` and `building:*` key. */
export function compactMapTags(tags: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter(
      ([key]) => structural.has(key) || key.startsWith('roof:') || key.startsWith('building:'),
    ),
  )
}
