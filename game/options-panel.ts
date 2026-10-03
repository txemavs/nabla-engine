/**
 * Hidden options panel for the game.
 *
 * Opened with F12 or a small toggle button in the corner.
 * All UI strings in Spanish, following Studio conventions.
 */

import {
  readGameOptions,
  saveGameOptions,
  getStorageInfo,
  requestPersistentStorage,
  getCacheInfo,
  setCacheBudget,
  clearCache,
  formatBytes,
  type GameOptions,
} from './options.js'
import { vehiclePresets, hasVehiclePreset } from '../src/catalog/vehicles/library.js'

export interface OptionsCallbacks {
  onViewDistanceChange?: (distance: number) => void
  onTileConcurrencyChange?: (concurrency: number, ahead: number) => void
  onTilesBaseUrlChange?: (url: string) => void
  onVehicleChange?: (vehicleId: string) => void
}

export class OptionsPanel {
  private panel: HTMLElement
  private toggle: HTMLElement
  private options: GameOptions
  private callbacks: OptionsCallbacks

  constructor(callbacks: OptionsCallbacks = {}) {
    this.callbacks = callbacks
    this.options = readGameOptions()
    this.panel = this.createPanel()
    this.toggle = this.createToggle()
    this.setupKeyboardShortcut()
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div')
    panel.id = 'options-panel'
    panel.className = 'options-panel hidden'
    panel.innerHTML = `
      <div class="options-header">
        <h2>Opciones</h2>
        <button class="options-close" aria-label="Cerrar">×</button>
      </div>
      <div class="options-content">
        <section class="options-section">
          <h3>Caché de teselas</h3>
          <p class="options-note">
            El navegador decide la cuota real. La caché acelera revisitas y reduce tráfico.
            Cada tesela puede ocupar hasta 64 MB.
          </p>
          <div class="option-row">
            <label for="cache-budget">Presupuesto</label>
            <select id="cache-budget">
              <option value="0">Desactivada</option>
              <option value="100">100 MB</option>
              <option value="500">500 MB</option>
              <option value="1000">1 GB</option>
              <option value="2000">2 GB</option>
              <option value="5000">5 GB</option>
              <option value="10000">10 GB</option>
              <option value="25000">25 GB</option>
              <option value="50000">50 GB</option>
              <option value="100000">100 GB</option>
            </select>
          </div>
          <div class="option-info" id="cache-usage">Consultando caché…</div>
          <div class="option-info" id="storage-quota">Consultando cuota…</div>
          <div class="option-buttons">
            <button id="cache-persist">Proteger almacenamiento</button>
            <button id="cache-clear">Vaciar caché</button>
          </div>
        </section>

        <section class="options-section">
          <h3>Streaming</h3>
          <div class="option-row">
            <label for="tile-concurrency">Concurrencia</label>
            <select id="tile-concurrency">
              <option value="1">1 descarga</option>
              <option value="2">2 descargas</option>
              <option value="3">3 descargas</option>
            </select>
          </div>
          <div class="option-row">
            <label for="prefetch-ahead">Anticipación</label>
            <select id="prefetch-ahead">
              <option value="0">Desactivada</option>
              <option value="15">15 s</option>
              <option value="30">30 s</option>
              <option value="45">45 s</option>
            </select>
          </div>
          <div class="option-row">
            <label for="view-distance">Distancia de dibujado</label>
            <select id="view-distance">
              <option value="1000">1 km</option>
              <option value="2000">2 km</option>
              <option value="4000">4 km</option>
              <option value="6000">6 km</option>
              <option value="10000">10 km</option>
              <option value="20000">20 km</option>
            </select>
          </div>
        </section>

        <section class="options-section">
          <h3>Avanzado</h3>
          <div class="option-row">
            <label for="tiles-base-url">URL base de teselas</label>
            <input type="text" id="tiles-base-url" placeholder="Dejar vacío para usar el valor por defecto">
          </div>
          <div class="option-row">
            <label for="vehicle-select">Vehículo</label>
            <select id="vehicle-select">
              <option value="">Por defecto (URL)</option>
            </select>
          </div>
          <p class="options-note">Los cambios de vehículo o URL de teselas requieren recargar la página.</p>
        </section>
      </div>
    `
    document.body.appendChild(panel)

    this.setupEventListeners(panel)
    this.populateVehicles(panel)
    this.loadCurrentValues(panel)
    void this.refreshCacheInfo()

    return panel
  }

  private createToggle(): HTMLElement {
    const toggle = document.createElement('button')
    toggle.id = 'options-toggle'
    toggle.className = 'options-toggle'
    toggle.setAttribute('aria-label', 'Opciones (F12)')
    toggle.innerHTML = '⚙'
    toggle.addEventListener('click', () => this.toggle())
    document.body.appendChild(toggle)
    return toggle
  }

  private setupKeyboardShortcut(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F12' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        this.toggle()
      }
    })
  }

  private setupEventListeners(panel: HTMLElement): void {
    panel.querySelector('.options-close')?.addEventListener('click', () => this.hide())

    panel.querySelector('#cache-budget')?.addEventListener('change', async (e) => {
      const value = Number((e.target as HTMLSelectElement).value)
      this.options.cacheBudgetMb = value
      saveGameOptions(this.options)
      try {
        await setCacheBudget(value)
        await this.refreshCacheInfo()
      } catch {
        this.setInfo('cache-usage', 'Error al ajustar la caché')
      }
    })

    panel.querySelector('#cache-persist')?.addEventListener('click', async () => {
      const granted = await requestPersistentStorage()
      await this.refreshStorageInfo()
      if (granted) {
        this.setInfo('storage-quota', 'Almacenamiento persistente concedido.')
      } else {
        this.setInfo('storage-quota', 'El navegador no concedió persistencia.')
      }
    })

    panel.querySelector('#cache-clear')?.addEventListener('click', async () => {
      try {
        await clearCache()
        await this.refreshCacheInfo()
      } catch {
        this.setInfo('cache-usage', 'Error al vaciar la caché')
      }
    })

    panel.querySelector('#tile-concurrency')?.addEventListener('change', (e) => {
      const value = Number((e.target as HTMLSelectElement).value)
      this.options.tileConcurrency = value
      saveGameOptions(this.options)
      this.callbacks.onTileConcurrencyChange?.(value, this.options.prefetchAhead)
    })

    panel.querySelector('#prefetch-ahead')?.addEventListener('change', (e) => {
      const value = Number((e.target as HTMLSelectElement).value)
      this.options.prefetchAhead = value
      saveGameOptions(this.options)
      this.callbacks.onTileConcurrencyChange?.(this.options.tileConcurrency, value)
    })

    panel.querySelector('#view-distance')?.addEventListener('change', (e) => {
      const value = Number((e.target as HTMLSelectElement).value)
      this.options.viewDistance = value
      saveGameOptions(this.options)
      this.callbacks.onViewDistanceChange?.(value)
    })

    panel.querySelector('#tiles-base-url')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLInputElement).value.trim()
      this.options.tilesBaseUrl = value
      saveGameOptions(this.options)
      this.callbacks.onTilesBaseUrlChange?.(value)
    })

    panel.querySelector('#vehicle-select')?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value
      this.options.vehicle = value
      saveGameOptions(this.options)
      this.callbacks.onVehicleChange?.(value)
    })
  }

  private populateVehicles(panel: HTMLElement): void {
    const select = panel.querySelector('#vehicle-select') as HTMLSelectElement
    if (!select) return

    try {
      const presets = vehiclePresets()
      for (const preset of presets) {
        const option = document.createElement('option')
        option.value = preset.id
        option.textContent = preset.label || preset.id
        select.appendChild(option)
      }
    } catch {
      /* No presets available. */
    }
  }

  private loadCurrentValues(panel: HTMLElement): void {
    const cacheBudget = panel.querySelector('#cache-budget') as HTMLSelectElement
    if (cacheBudget) cacheBudget.value = String(this.options.cacheBudgetMb)

    const tileConcurrency = panel.querySelector('#tile-concurrency') as HTMLSelectElement
    if (tileConcurrency) tileConcurrency.value = String(this.options.tileConcurrency)

    const prefetchAhead = panel.querySelector('#prefetch-ahead') as HTMLSelectElement
    if (prefetchAhead) prefetchAhead.value = String(this.options.prefetchAhead)

    const viewDistance = panel.querySelector('#view-distance') as HTMLSelectElement
    if (viewDistance) viewDistance.value = String(this.options.viewDistance)

    const tilesBaseUrl = panel.querySelector('#tiles-base-url') as HTMLInputElement
    if (tilesBaseUrl) tilesBaseUrl.value = this.options.tilesBaseUrl

    const vehicleSelect = panel.querySelector('#vehicle-select') as HTMLSelectElement
    if (vehicleSelect && this.options.vehicle) {
      vehicleSelect.value = this.options.vehicle
    }
  }

  private async refreshCacheInfo(): Promise<void> {
    const info = await getCacheInfo()
    if (info) {
      this.setInfo(
        'cache-usage',
        `Uso: ${formatBytes(info.bytes)} / ${formatBytes(info.budget)} · ${info.entries} archivos`,
      )
    } else {
      this.setInfo('cache-usage', 'Caché no disponible')
    }
    await this.refreshStorageInfo()
  }

  private async refreshStorageInfo(): Promise<void> {
    const storage = await getStorageInfo()
    let text = ''
    if (storage.quota !== null) {
      text = `Cuota del sitio: ${formatBytes(storage.quota)} · uso: ${formatBytes(storage.usage)}`
      if (storage.persisted) {
        text += ' · persistente'
      }
    } else {
      text = 'Cuota no disponible en este navegador'
    }
    this.setInfo('storage-quota', text)
  }

  private setInfo(id: string, text: string): void {
    const el = this.panel.querySelector(`#${id}`)
    if (el) el.textContent = text
  }

  toggle(): void {
    if (this.panel.classList.contains('hidden')) {
      this.show()
    } else {
      this.hide()
    }
  }

  show(): void {
    this.panel.classList.remove('hidden')
    void this.refreshCacheInfo()
  }

  hide(): void {
    this.panel.classList.add('hidden')
  }

  isVisible(): boolean {
    return !this.panel.classList.contains('hidden')
  }

  getOptions(): GameOptions {
    return { ...this.options }
  }
}
