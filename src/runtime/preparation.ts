import { startBootPhase } from './boot-trace.js'
import { nextPaint } from './next-paint.js'
import { t } from '../i18n/index.js'

const REVEAL_STAGES = 5

/** Resource owners supply work; this coordinator owns queues, gates and progress ordering. */
export interface RuntimePreparationHooks<Context> {
  prepareAudio(): void
  vehiclesReady(): Promise<unknown>
  loadWeaponAssets(): Promise<void>
  ensureSidearm(): void
  warmSidearm(): Promise<unknown>
  prepareWeaponPools(): void
  prepareTerrain(signal: AbortSignal): Promise<Context>
  placeInitialPickup(context: Context): Promise<void>
  freezeAttract(): void
  warmPresentation(context: Context, signal: AbortSignal): Promise<void>
}

export class RuntimePreparation<Context> {
  private readonly preparationGates: Promise<unknown>[] = []
  private readonly revealGates: Promise<unknown>[] = []
  private readonly revealTasks: (() => Promise<unknown>)[] = []
  private bootDetailDone?: () => void

  constructor(
    private readonly canvas: Pick<HTMLCanvasElement, 'dataset'>,
    private readonly hooks: RuntimePreparationHooks<Context>,
    private readonly publish = () => window.dispatchEvent(new CustomEvent('nabla-load-step')),
    private readonly paint = nextPaint,
  ) {}

  holdPreparation(gate: Promise<unknown>): void {
    this.preparationGates.push(gate.catch(() => undefined))
  }
  holdReveal(gate: Promise<unknown>): void {
    this.revealGates.push(gate.catch(() => undefined))
  }
  beforeReveal(task: () => Promise<unknown>): void {
    this.revealTasks.push(task)
  }

  finishDetail(): void {
    this.bootDetailDone?.()
    this.bootDetailDone = undefined
  }

  /** Terminal cleanup of queued host work; active work is cancelled by its play signal. */
  dispose(): void {
    this.finishDetail()
    this.preparationGates.length = 0
    this.revealGates.length = 0
    this.revealTasks.length = 0
  }

  stage(name: string, done: number): void {
    this.canvas.dataset.revealStage = name
    this.canvas.dataset.loadingStage = name
    this.canvas.dataset.revealProgress = (done / REVEAL_STAGES).toFixed(2)
  }

  async reportLoadStep(
    detail: string,
    description = detail,
    group?: import('./boot-trace.js').BootGroup,
  ): Promise<void> {
    this.bootDetailDone?.()
    this.bootDetailDone = startBootPhase(
      description,
      undefined,
      group ??
        (['shaders', 'preload', 'ready'].includes(this.canvas.dataset.loadingStage ?? '')
          ? '05 GPU y presentación'
          : '03 Mundo y recursos'),
    )
    const now = performance.now()
    const canvas = this.canvas
    const previous = canvas.dataset.loadingDetail
    const since = Number(canvas.dataset.loadingDetailSince)
    if (previous && Number.isFinite(since)) {
      const timings = JSON.parse(canvas.dataset.bootTimings ?? '[]') as {
        phase: string
        ms: number
      }[]
      timings.push({ phase: previous, ms: Math.round(now - since) })
      canvas.dataset.bootTimings = JSON.stringify(timings.slice(-100))
    }
    this.canvas.dataset.loadingDetail = detail
    this.canvas.dataset.loadingDetailSince = String(performance.now())
    this.publish()
    await this.paint()
  }

  async prepare(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const wait = <T>(work: Promise<T>) => waitForPreparation(work, signal)
    const canvas = this.canvas
    canvas.dataset.reveal = 'preparing'
    if (this.preparationGates.length) {
      const gateDone = startBootPhase(
        'Esperar autorización de la presentación del juego para preparar recursos y GPU',
        undefined,
        '06 Esperas del host',
      )
      try {
        await wait(Promise.all(this.preparationGates.splice(0)))
        signal.throwIfAborted()
      } finally {
        gateDone()
      }
    }
    signal.throwIfAborted()
    await wait(this.reportLoadStep(t('load.loading-audio'), 'Preparar contexto de audio y sonidos'))
    signal.throwIfAborted()
    this.hooks.prepareAudio()
    // 1. Vehicle GLBs (the bike included) and 2. the sidearm models land in the asset cache.
    this.stage('vehicles', 0)
    await wait(
      this.reportLoadStep(
        t('load.loading-vehicles'),
        'Esperar modelos y recursos visuales de los vehículos iniciales',
      ),
    )
    signal.throwIfAborted()
    await wait(this.hooks.vehiclesReady())
    signal.throwIfAborted()
    this.stage('weapons', 1)
    await wait(
      this.reportLoadStep(
        t('load.loading-weapons'),
        'Descargar y decodificar modelos del arma inicial',
      ),
    )
    signal.throwIfAborted()
    await wait(this.hooks.loadWeaponAssets())
    signal.throwIfAborted()
    // The viewmodel itself (HK model, magazine, flash, laser): built and compiled now, so the
    // first draw shows the pistol instead of the placeholder block while it loads.
    this.hooks.ensureSidearm()
    await wait(
      this.reportLoadStep(
        t('load.preparing-magazines'),
        'Preparar arma en primera persona, cargadores y shaders',
        '05 GPU y presentación',
      ),
    )
    signal.throwIfAborted()
    await wait(this.hooks.warmSidearm())
    signal.throwIfAborted()
    // Casing meshes join the scene before the shader stage, so the first shot compiles nothing.
    this.hooks.prepareWeaponPools()
    // 3. Terrain, photos, buildings and map meshes around the start: everything the descent
    // from high above shows, at the LODs the stream plans there.
    this.stage('terrain', 2)
    await wait(
      this.reportLoadStep(
        t('load.preparing-scene'),
        'Preparar escena y contenido previo a la presentación',
      ),
    )
    signal.throwIfAborted()
    this.bootDetailDone?.()
    for (const [index, task] of this.revealTasks.splice(0).entries()) {
      signal.throwIfAborted()
      const taskDone = startBootPhase(
        `Contenido del host antes de revelar: tarea ${index + 1}`,
        undefined,
        '03 Mundo y recursos',
      )
      try {
        await wait(task().catch((error) => console.warn('beforeReveal task failed', error)))
        signal.throwIfAborted()
      } finally {
        taskDone()
      }
    }
    signal.throwIfAborted()
    const context = await wait(this.hooks.prepareTerrain(signal))
    signal.throwIfAborted()
    // 4. Shader programs (chase, cockpit, mirrors, the new tiles) and texture uploads, on a copy
    await wait(this.hooks.placeInitialPickup(context))
    signal.throwIfAborted()
    // of the camera so the attract frames keep their own projection.
    // Heavy GPU preparation keeps the already-visible planet still, without delaying startup.
    this.hooks.freezeAttract()
    this.stage('shaders', 3)
    await wait(
      this.reportLoadStep(
        t('load.preparing-poses-lights-and-materials'),
        'Sincronizar poses, visibilidad y luces para el primer fotograma',
      ),
    )
    signal.throwIfAborted()
    await wait(this.hooks.warmPresentation(context, signal))
    signal.throwIfAborted()
    this.stage('ready', REVEAL_STAGES)
    canvas.dataset.reveal = 'holding'
    await wait(
      this.reportLoadStep(
        t('load.simulation-ready'),
        'Presentación preparada; publicar estado listo',
      ),
    )
    signal.throwIfAborted()
    this.bootDetailDone?.()
    if (this.revealGates.length) {
      const introDone = startBootPhase(
        'Esperar intro/créditos del host antes de revelar',
        undefined,
        '06 Esperas del host',
      )
      try {
        while (this.revealGates.length) {
          await wait(Promise.all(this.revealGates.splice(0)))
          signal.throwIfAborted()
        }
      } finally {
        introDone()
      }
    }
  }
}

/** Abort host gates and asset waits promptly; late settlement cannot resume preparation. */
function waitForPreparation<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
    if (signal.aborted) abort()
  })
}
