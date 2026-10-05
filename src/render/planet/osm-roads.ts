import type { PlanetLayerFile } from '../../planet/contract.js'
import { gunzipText } from '../../util/gzip.js'
import { sha256 } from '../../util/sha256.js'

/** Fetch a verified `osm.snapshot` gzip from the tile host. Never talks to Overpass. */
export async function fetchOsmSnapshot(
  url: string,
  file: PlanetLayerFile,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    signal: signal ?? AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`OSM snapshot ${url}: HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength !== file.bytes) throw new Error(`OSM snapshot ${url}: size mismatch`)
  if ((await sha256(bytes)) !== file.sha256)
    throw new Error(`OSM snapshot ${url}: checksum mismatch`)
  return JSON.parse(await gunzipText(bytes))
}
