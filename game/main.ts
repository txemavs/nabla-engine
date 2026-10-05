/** Entry point: the terrain chosen by the URL or the menu (flat tile, tile host, package folder). */
import { resolveEntry } from './entry.js'

const entry = await resolveEntry()
// Show the address that is really played, so reloading or sharing it repeats this session.
if (entry.search !== location.search)
  history.replaceState(null, '', entry.search || location.pathname)
await import(entry.mode === 'terrain' ? './terrain-main.js' : './drive.js')
