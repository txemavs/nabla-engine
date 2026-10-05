/**
 * Loading screen controller for the 3x3 initial tile grid.
 */

import { mapTileAt, mapTileId, type MapTile } from '@nabla/engine/scene'
import {
  applySplashSkin,
  resolveSplashSkin,
  splashMessageAt,
  type EngineSplashSkin,
} from '@nabla/engine/runtime/splash'

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
  private skin: EngineSplashSkin

  /** Default Nabla skin; hosts pass logo, title, messages, layout and theme CSS. */
  constructor(skin: EngineSplashSkin = {}) {
    this.screen = document.getElementById('loading-screen')!
    this.status = document.getElementById('loading-status')!
    this.progressBar = document.getElementById('loading-progress-bar')!
    this.tileIndicators = Array.from(document.querySelectorAll('.tile-indicator'))
    this.skin = applySplashSkin(this.screen, skin)
  }

  /** Swap skin at runtime (e.g. switch to the bottom-left attract layout). */
  setSkin(skin: EngineSplashSkin): void {
    this.skin = applySplashSkin(this.screen, { ...this.skin, ...skin })
  }

  get layout(): EngineSplashSkin['layout'] {
    return resolveSplashSkin(this.skin).layout
  }

  /** Show the host message for a 0..1 boot phase, unless a more specific status follows. */
  setPhase(progress: number): void {
    const message = splashMessageAt(this.skin.messages, Math.min(1, Math.max(0, progress)))
    if (message) this.setStatus(message)
  }

  setSpawn(latitude: number, longitude: number): void {
    this.centerTile = mapTileAt(latitude, longitude, 15)
    this.setTiles(this.get3x3Grid(this.centerTile))
  }

  setTiles(tiles: MapTile[]): void {
    this.grid3x3 = [...tiles]
    const grid = document.getElementById('loading-tiles')!
    grid.replaceChildren(
      ...tiles.map(() => {
        const indicator = document.createElement('div')
        indicator.className = 'tile-indicator'
        return indicator
      }),
    )
    grid.style.gridTemplateColumns = `repeat(${tiles.length === 4 ? 2 : 3}, 1fr)`
    this.tileIndicators = Array.from(grid.children) as HTMLElement[]
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

  setStatus(message: string): void {
    this.status.textContent = message
  }

  /** Extra lines under the status (requests in flight, last error); empty hides them. */
  setDetail(message: string): void {
    let detail = document.getElementById('loading-detail')
    if (!detail) {
      detail = document.createElement('div')
      detail.id = 'loading-detail'
      detail.setAttribute('role', 'status')
      this.status.after(detail)
    }
    detail.textContent = message
    // `status: false` / the mark layout keep every load text hidden.
    detail.hidden = !message || this.screen.classList.contains('splash-no-status')
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

export interface ErrorButton {
  label: string
  onClick: () => void
}

export function showError(message: string, buttons: readonly ErrorButton[] = []): void {
  const errorEl = document.getElementById('error-message')!
  const textEl = document.getElementById('error-text')!
  textEl.textContent = message
  // Recovery buttons go before "Recargar"; earlier ones from a previous error are replaced.
  errorEl.querySelectorAll('button.recovery').forEach((button) => button.remove())
  const reload = errorEl.querySelector('button')
  for (const { label, onClick } of buttons) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'recovery'
    button.textContent = label
    button.addEventListener('click', onClick)
    errorEl.insertBefore(button, reload)
  }
  errorEl.classList.add('visible')
}
