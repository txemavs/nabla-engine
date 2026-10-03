/**
 * Loading screen controller for the 3x3 initial tile grid.
 */

import { mapTileAt, mapTileId, type MapTile } from '../src/scene/mercator.js'
import {
  withNablaIndicator,
  type NablaIndicatorState,
} from '../src/ui/nabla-indicator.js'

export interface LoadingProgress {
  total: number
  loaded: number
  tiles: Map<string, boolean>
}

export class LoadingScreen {
  private screen: HTMLElement
  private status: HTMLElement
  private progressBar: HTMLElement
  private tileIndicators: HTMLElement[]
  private centerTile: MapTile | null = null
  private grid3x3: MapTile[] = []
  private loadedTiles = new Set<string>()
  private currentState: NablaIndicatorState = 'reconnecting'

  constructor() {
    this.screen = document.getElementById('loading-screen')!
    this.status = document.getElementById('loading-status')!
    this.progressBar = document.getElementById('loading-progress-bar')!
    this.tileIndicators = Array.from(document.querySelectorAll('.tile-indicator'))
  }

  setSpawn(latitude: number, longitude: number): void {
    this.centerTile = mapTileAt(latitude, longitude, 15)
    this.grid3x3 = this.get3x3Grid(this.centerTile)
    this.loadedTiles.clear()
    this.updateIndicators()
  }

  private get3x3Grid(center: MapTile): MapTile[] {
    const tiles: MapTile[] = []
    const n = 2 ** center.z
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const y = center.y + dy
        if (y < 0 || y >= n) continue
        tiles.push({
          z: center.z,
          x: (center.x + dx + n) % n,
          y,
        })
      }
    }
    return tiles
  }

  getRequiredTiles(): MapTile[] {
    return [...this.grid3x3]
  }

  markTileLoaded(tileId: string): void {
    this.loadedTiles.add(tileId)
    this.updateIndicators()
  }

  isComplete(): boolean {
    return this.grid3x3.every((tile) => this.loadedTiles.has(mapTileId(tile)))
  }

  getProgress(): LoadingProgress {
    const tiles = new Map<string, boolean>()
    for (const tile of this.grid3x3) {
      tiles.set(mapTileId(tile), this.loadedTiles.has(mapTileId(tile)))
    }
    return {
      total: this.grid3x3.length,
      loaded: this.loadedTiles.size,
      tiles,
    }
  }

  private updateIndicators(): void {
    const progress = this.getProgress()
    const percent = progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0
    this.progressBar.style.width = `${percent}%`

    let index = 0
    for (const tile of this.grid3x3) {
      if (index < this.tileIndicators.length) {
        const indicator = this.tileIndicators[index]
        const isLoaded = this.loadedTiles.has(mapTileId(tile))
        const isCenter = this.centerTile && mapTileId(tile) === mapTileId(this.centerTile)
        indicator.classList.toggle('loaded', isLoaded)
        indicator.classList.toggle('center', !!isCenter)
      }
      index++
    }
  }

  setStatus(message: string, state?: NablaIndicatorState): void {
    if (state !== undefined) this.currentState = state
    this.status.innerHTML = withNablaIndicator(message, this.currentState)
  }

  hide(): void {
    this.screen.classList.add('hidden')
    setTimeout(() => {
      this.screen.style.display = 'none'
    }, 500)
  }

  show(): void {
    this.screen.style.display = 'flex'
    this.screen.classList.remove('hidden')
  }
}

export function showError(message: string): void {
  const errorEl = document.getElementById('error-message')!
  const textEl = document.getElementById('error-text')!
  textEl.textContent = message
  errorEl.classList.add('visible')
}
