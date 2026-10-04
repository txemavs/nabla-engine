/** Entry point: the terrain-folder example when the URL names a terrain, otherwise the original drive demo. */
import { wantsTerrain } from './terrain.js'

await (wantsTerrain() ? import('./terrain-main.js') : import('./drive.js'))
