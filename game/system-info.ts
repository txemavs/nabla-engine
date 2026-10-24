import type { GameRuntime } from '@nabla/engine/runtime/browser'
import { t } from '@nabla/engine/i18n'

type InfoRuntime = Pick<
  GameRuntime,
  | 'backend'
  | 'physicsThread'
  | 'settings'
  | 'session'
  | 'visibility'
  | 'streaming'
  | 'cellStats'
  | 'displaySettings'
  | 'resolutionScaleState'
  | 'fsrSettings'
>
export type SystemInfoRow = readonly [label: string, value: string]

/** Read the active runtime and browser; unavailable metrics are never guessed. */
export function systemInfoRows(runtime: InfoRuntime, doc: Document): SystemInfoRow[] {
  const win = doc.defaultView
  const nav = win?.navigator
  const unknown = t('info.unavailable')
  const canvas = doc.getElementById('game-canvas') as HTMLCanvasElement | null
  const scale = runtime.resolutionScaleState
  const fsr = runtime.fsrSettings
  const cells = runtime.cellStats
  const deviceMemory = (nav as Navigator & { deviceMemory?: number })?.deviceMemory
  let pads: string = unknown
  try {
    if (nav?.getGamepads)
      pads =
        [...nav.getGamepads()]
          .filter((pad) => pad?.connected)
          .map((pad) => pad!.id)
          .join(', ') || t('info.none-detected')
  } catch {
    /* The browser can deny input enumeration. */
  }
  const yesNo = (value: boolean | undefined) =>
    value === undefined ? unknown : t(value ? 'info.yes' : 'info.no')
  return [
    [
      t('info.renderer'),
      runtime.backend === 'webgpu' ? 'WebGPU' : runtime.backend === 'webgl' ? 'WebGL' : unknown,
    ],
    [t('info.physics'), runtime.physicsThread ?? unknown],
    [t('info.session'), runtime.session?.state ?? unknown],
    [t('info.settings-mode'), runtime.settings?.mode ?? unknown],
    [t('info.profile'), runtime.visibility?.preset ?? unknown],
    [t('info.buffer'), canvas ? `${canvas.width} × ${canvas.height} px` : unknown],
    [
      t('info.viewport'),
      win ? `${win.innerWidth} × ${win.innerHeight} CSS px · DPR ${win.devicePixelRatio}` : unknown,
    ],
    [t('info.scale'), scale ? `${Math.round(scale.scale * 100)}% · ${scale.mode}` : unknown],
    [
      t('info.fps-limit'),
      runtime.displaySettings
        ? runtime.displaySettings.maxFps
          ? String(runtime.displaySettings.maxFps)
          : t('info.unlimited')
        : unknown,
    ],
    [t('info.fsr'), fsr ? `${fsr.mode} · ${Math.round(fsr.sharpness * 100)}%` : unknown],
    [
      t('info.streaming'),
      runtime.streaming
        ? `${runtime.streaming.distance} m · ${runtime.streaming.cells} ${t('info.cells')}`
        : unknown,
    ],
    [t('info.terrain'), cells ? t('info.terrain-counts', { ...cells }) : t('info.no-terrain')],
    [t('info.threads'), nav?.hardwareConcurrency ? String(nav.hardwareConcurrency) : unknown],
    [t('info.memory'), deviceMemory ? `≈ ${deviceMemory} GiB` : unknown],
    [t('info.secure'), yesNo(win?.isSecureContext)],
    [t('info.isolated'), yesNo(win?.crossOriginIsolated)],
    [t('info.xr-api'), yesNo(nav ? 'xr' in nav : undefined)],
    [t('info.online'), yesNo(nav?.onLine)],
    [t('info.controllers'), pads],
    [t('info.browser'), nav?.userAgent ?? unknown],
  ]
}

/** No probe, new render context or background timer; the menu owns refresh and lifetime. */
export function createSystemInfo(doc: Document, runtime: InfoRuntime) {
  const root = doc.createElement('div')
  root.id = 'settings-system-info'
  const title = doc.createElement('h3')
  title.textContent = t('info.title')
  const note = doc.createElement('p')
  note.textContent = t('info.note')
  const list = doc.createElement('dl')
  list.className = 'settings-system-info-list'
  const status = doc.createElement('p')
  status.setAttribute('role', 'status')
  let report = ''
  const refresh = () => {
    const rows = systemInfoRows(runtime, doc)
    const next = rows.map(([label, value]) => `${label}: ${value}`).join('\n')
    if (report === next) return
    report = next
    list.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const name = doc.createElement('dt'),
          content = doc.createElement('dd')
        name.textContent = label
        content.textContent = value
        return [name, content]
      }),
    )
  }
  const copy = doc.createElement('button')
  copy.type = 'button'
  copy.textContent = t('info.copy')
  copy.onclick = async () => {
    refresh()
    try {
      await doc.defaultView!.navigator.clipboard.writeText(report)
      status.textContent = t('settings.copied')
    } catch {
      status.textContent = t('info.copy-failed')
    }
  }
  root.append(title, note, list, copy, status)
  refresh()
  return { root, refresh }
}
