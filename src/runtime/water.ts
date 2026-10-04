import type { SceneDocument } from '../scene/document.js'
import { skyTime, type SkyClock } from '../planet/sky.js'
import { simplifiedTide } from '../planet/tide.js'
/** Shared visual/physics water level. Tide is the existing approximate model. */
export function worldWater(water: SceneDocument['water'], clock?: SkyClock, now = Date.now()) {
  const settings = water ?? { mode: 'tide', level: 0, amplitude: 1 }
  return settings.mode === 'manual'
    ? { level: settings.level, state: 'Manual' }
    : simplifiedTide(skyTime(clock, now).getTime(), settings.amplitude)
}
