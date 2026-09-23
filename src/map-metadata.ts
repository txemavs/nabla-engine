/** OSM attributes used to classify, rebuild or drive the imported geometry.
 * Descriptive/address/contact/history tags stay in the raw/baked extract.
 */
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
export function compactMapTags(tags: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter(
      ([key]) => structural.has(key) || key.startsWith('roof:') || key.startsWith('building:'),
    ),
  )
}
