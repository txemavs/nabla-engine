/**
 * Loading screen controller for the 3x3 initial tile grid.
 * Tracks both loaded and absent tiles so the game can start when all tiles
 * are either loaded or confirmed absent.
 */

import { mapTileAt, mapTileId, type MapTile } from '../src/scene/mercator.js'

export interface LoadingProgress {
  total: number
  loaded: number
  absent: number
  failed: number
  tiles: Map<string, 'pending' | 'loaded' | 'absent' | 'failed'>
}

export class LoadingScreen {
  private screen: HTMLElement
  private status: HTMLElement
  private progressBar: HTMLElement
  private tileIndicators: HTMLElement[]
  private centerTile: MapTile | null = null
  private grid3x3: MapTile[] = []
  private loadedTiles = new Set<string>()
  private absentTiles = new Set<string>()
  private failedTiles = new Set<string>()

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
    this.absentTiles.clear()
    this.failedTiles.clear()
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
    this.absentTiles.delete(tileId)
    this.failedTiles.delete(tileId)
    this.updateIndicators()
  }

  markTileAbsent(tileId: string): void {
    if (!this.loadedTiles.has(tileId)) {
      this.absentTiles.add(tileId)
      this.updateIndicators()
    }
  }

  markTileFailed(tileId: string): void {
    if (!this.loadedTiles.has(tileId) && !this.absentTiles.has(tileId)) {
      this.failedTiles.add(tileId)
      this.updateIndicators()
    }
  }

  /**
   * Check if loading is complete. Complete means all tiles are either:
   * - loaded (available and downloaded)
   * - absent (confirmed not published)
   * - failed (errored after max retries)
   */
  isComplete(): boolean {
    return this.grid3x3.every((tile) => {
      const id = mapTileId(tile)
      return this.loadedTiles.has(id) || this.absentTiles.has(id) || this.failedTiles.has(id)
    })
  }

  /** Check if at least one tile loaded (game can start). */
  hasAnyLoaded(): boolean {
    return this.loadedTiles.size > 0
  }

  /** Check if all tiles are absent or failed (game cannot start). */
  hasNoLoadedTiles(): boolean {
    return this.loadedTiles.size === 0 && this.isComplete()
  }

  getProgress(): LoadingProgress {
    const tiles = new Map<string, 'pending' | 'loaded' | 'absent' | 'failed'>()
    for (const tile of this.grid3x3) {
      const id = mapTileId(tile)
      if (this.loadedTiles.has(id)) {
        tiles.set(id, 'loaded')
      } else if (this.absentTiles.has(id)) {
        tiles.set(id, 'absent')
      } else if (this.failedTiles.has(id)) {
        tiles.set(id, 'failed')
      } else {
        tiles.set(id, 'pending')
      }
    }
    return {
      total: this.grid3x3.length,
      loaded: this.loadedTiles.size,
      absent: this.absentTiles.size,
      failed: this.failedTiles.size,
      tiles,
    }
  }

  private updateIndicators(): void {
    const progress = this.getProgress()
    const resolved = progress.loaded + progress.absent + progress.failed
    const percent = progress.total > 0 ? (resolved / progress.total) * 100 : 0
    this.progressBar.style.width = `${percent}%`

    let index = 0
    for (const tile of this.grid3x3) {
      if (index < this.tileIndicators.length) {
        const indicator = this.tileIndicators[index]
        const tileId = mapTileId(tile)
        const state = progress.tiles.get(tileId) ?? 'pending'
        const isCenter = this.centerTile && tileId === mapTileId(this.centerTile)

        indicator.classList.toggle('loaded', state === 'loaded')
        indicator.classList.toggle('absent', state === 'absent')
        indicator.classList.toggle('failed', state === 'failed')
        indicator.classList.toggle('center', !!isCenter)
      }
      index++
    }
  }

  setStatus(message: string): void {
    this.status.textContent = message
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
