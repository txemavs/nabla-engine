/** Entry point: the terrain-folder example when the URL names a terrain (or is bare and a terrain mount exists), otherwise the original drive demo. */
import { resolveTerrainSearch } from './terrain.js'

const search = await resolveTerrainSearch()
if (search === null) await import('./drive.js')
else {
  // The terrain entry reads the resolved query, so a bare URL shows the address that was played.
  if (search !== location.search) history.replaceState(null, '', search)
  await import('./terrain-main.js')
}
