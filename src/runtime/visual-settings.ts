import type { Object3D } from 'three'
import { smokeTuning } from '../config/gameplay-tuning.js'
import { bindSmokeDensity, setSmokeDensity } from '../render/entity/smoke-density.js'
import {
  createWorldVisualSettings,
  groundPhotoAnisotropy,
  setGroundPhotoAnisotropy,
} from '../render/planet/world.js'
import { hiddenTileLayers, setHiddenTileLayers } from '../render/planet/tile-layers.js'
import { asphaltContrast, setAsphaltContrast } from '../render/planet/ground-material.js'
import {
  createBeamSettings,
  getVehicleBeamCutoff,
  setVehicleBeamCutoff,
} from '../render/vehicle-presentation/authored-lights.js'

/** Per-runtime live state shared with current and future views; no browser-global storage. */
export class RuntimeVisualSettings {
  readonly world = createWorldVisualSettings()
  readonly beams = createBeamSettings()
  readonly smokeDensity = { value: smokeTuning.defaultPercent / 100 }

  bindScene(scene: Object3D): void {
    bindSmokeDensity(scene, this.smokeDensity)
  }

  get hiddenLayers(): string[] {
    return hiddenTileLayers(this.world.hidden)
  }

  setHiddenLayers(ids: Iterable<string>): void {
    setHiddenTileLayers(ids, this.world.hidden)
  }

  get anisotropy(): number {
    return groundPhotoAnisotropy(this.world)
  }

  setAnisotropy(value: number, maximum: number): number {
    return setGroundPhotoAnisotropy(Math.min(Math.max(1, value), maximum), this.world)
  }

  get asphaltContrast(): number {
    return asphaltContrast(this.world.asphalt)
  }

  setAsphaltContrast(value: number): void {
    setAsphaltContrast(value, this.world.asphalt)
  }

  get smokePercent(): number {
    return this.smokeDensity.value * 100
  }

  /** Omitting storage applies boot/quality defaults without overwriting saved preferences. */
  setSmokePercent(percent: number, storage?: Pick<Storage, 'setItem'>): void {
    const value = setSmokeDensity(percent, this.smokeDensity)
    try {
      storage?.setItem('nabla.smokePercent', String(value))
    } catch {
      // Live changes still apply when persistence is unavailable.
    }
  }

  getVehicleBeamCutoff(kind: 'low' | 'high'): number {
    return getVehicleBeamCutoff(kind, this.beams)
  }

  setVehicleBeamCutoff(kind: 'low' | 'high', degrees: number): void {
    setVehicleBeamCutoff(kind, degrees, this.beams)
  }
}
