import type { GameRuntime } from '../browser.js'

/** Main quality controls, shared by the desktop menu and the immersive touchscreen. */
export function bindXRQuality(
  runtime: GameRuntime,
  developmentElements: readonly HTMLElement[] = [],
  mountBrowserPanel = true,
): void {
  runtime.xr.enableCalibrationScreen()
  const xr = runtime.xr
  const profiles = [
    ['road', 'Carretera · Quest'],
    ['minimal', 'Mínima'],
    ['mobile', 'Móvil'],
    ['low', 'Baja'],
    ['balanced', 'Equilibrada'],
    ['high', 'Alta'],
    ['ultra', 'Ultra'],
  ]
  let profile = new URLSearchParams(location.search).get('quality') ?? 'minimal'
  const original = profile
  let pending = false,
    applying = false
  const panel = document.createElement('details')
  panel.id = 'xr-main-menu'
  panel.open = false
  panel.style.cssText =
    'position:fixed;left:12px;top:12px;z-index:10004;width:min(360px,calc(100vw - 100px));max-height:85vh;overflow:auto;background:#102632f5;color:#eefaff;border:1px solid #79bad4;border-radius:10px;padding:12px;font:14px system-ui;box-sizing:border-box'
  panel.innerHTML =
    '<summary>Calidad</summary><p>Resolución del casco y detalle de la carretera. X del mando abre el menú en VR.</p>'
  const rowsRoot = document.createElement('div'),
    status = document.createElement('p')
  const labels = [
    'Perfil',
    'Escala de resolución VR',
    'Reducir detalle periférico',
    'Humo',
    'Sombras',
    'Nitidez carretera',
    'Impactos visibles',
    'Casquillos',
    'Chispas',
    'Ocultar ruedas propias en VR',
  ]
  const values = () => [
    profiles.find((p) => p[0] === profile)?.[1] ?? profile,
    Math.round(xr.quality.scale * 100) + '%',
    Math.round(xr.quality.foveation * 100) + '%',
    xr.quality.effects ? 'Sí' : 'No',
    xr.quality.shadows ? 'Sí' : 'No',
    xr.quality.roadDetail + '×',
    String(xr.quality.impactLimit),
    String(xr.quality.casingLimit),
    xr.quality.sparks ? 'Sí' : 'No',
    xr.quality.hideOwnWheels ? 'Sí' : 'No',
  ]
  const outputs: HTMLOutputElement[] = []
  const refresh = () => {
    values().forEach((v, i) => (outputs[i].textContent = v))
    status.textContent = menu.status()
  }
  const applyLive = () => {
    xr.setQuality({})
    runtime.setSmokeEnabled(xr.quality.effects)
    runtime.setShadowsEnabled(xr.quality.shadows)
    runtime.setAnisotropy(xr.quality.roadDetail)
    refresh()
  }
  const menu = {
    rows: () => labels.map((label, i) => ({ label, value: values()[i] })),
    status: () =>
      applying
        ? 'Aplicando…'
        : pending || profile !== original
          ? 'Pendiente: Aplicar sale de VR y recarga. Después, entra de nuevo.'
          : 'Periferia y efectos: en vivo. Perfil, escala y sombras: Aplicar.',
    change: (row: number, dir: number) => {
      const q = xr.quality
      if (row === 0)
        profile =
          profiles[
            (Math.max(
              0,
              profiles.findIndex((p) => p[0] === profile),
            ) +
              dir +
              profiles.length) %
              profiles.length
          ][0]
      if (row === 1) {
        q.scale = Math.max(0.5, Math.min(1.5, Math.round((q.scale + dir * 0.05) * 100) / 100))
        pending = true
      }
      if (row === 2)
        q.foveation = Math.max(0, Math.min(1, Math.round((q.foveation + dir * 0.1) * 10) / 10))
      if (row === 3) q.effects = !q.effects
      if (row === 4) {
        q.shadows = !q.shadows
        pending = true
      }
      if (row === 5) {
        const steps = [1, 2, 4, 8, 16]
        q.roadDetail = steps[Math.max(0, Math.min(4, steps.indexOf(q.roadDetail) + dir))]
      }
      if (row === 6 || row === 7) {
        const key = row === 6 ? 'impactLimit' : 'casingLimit'
        const steps = row === 6 ? [0, 8, 16, 32, 64, 96] : [0, 4, 8, 12, 24]
        const current = steps.indexOf(q[key])
        const index = current >= 0 ? current : steps.findIndex((n) => n >= q[key])
        q[key] = steps[Math.max(0, Math.min(steps.length - 1, index + dir))]
      }
      if (row === 8) q.sparks = !q.sparks
      if (row === 9) q.hideOwnWheels = !q.hideOwnWheels
      applyLive()
    },
    road: () => {
      profile = 'road'
      pending = true
      xr.setQuality({
        scale: 1,
        foveation: 0.5,
        effects: false,
        sparks: false,
        impactLimit: 16,
        casingLimit: 4,
        shadows: false,
        roadDetail: 16,
      })
      applyLive()
    },
    apply: () => {
      if (applying) return
      applying = true
      refresh()
      void (async () => {
        await xr.exit()
        const url = new URL(location.href)
        url.searchParams.set('quality', profile)
        location.assign(url.href)
      })().catch((error) => {
        applying = false
        status.textContent = String(error)
      })
    },
  }
  for (let i = 0; i < labels.length; i++) {
    const row = document.createElement('div')
    row.style.cssText =
      'display:grid;grid-template-columns:1fr 32px 90px 32px;align-items:center;gap:4px;margin:10px 0'
    const label = document.createElement('span')
    label.textContent = labels[i]
    const minus = document.createElement('button'),
      plus = document.createElement('button'),
      value = document.createElement('output')
    minus.textContent = '−'
    plus.textContent = '+'
    minus.setAttribute('aria-label', 'Reducir ' + labels[i])
    plus.setAttribute('aria-label', 'Aumentar ' + labels[i])
    minus.onclick = () => menu.change(i, -1)
    plus.onclick = () => menu.change(i, 1)
    value.id = 'xr-quality-' + i
    outputs.push(value)
    row.append(label, minus, value, plus)
    rowsRoot.append(row)
  }
  const road = document.createElement('button')
  road.textContent = 'Perfil Carretera'
  road.onclick = menu.road
  const apply = document.createElement('button')
  apply.textContent = 'Aplicar calidad y reiniciar'
  apply.onclick = menu.apply
  panel.append(rowsRoot, road, apply, status)
  const development = document.createElement('details')
  development.id = 'xr-development'
  development.innerHTML = '<summary>Desarrollo</summary>'
  for (const element of developmentElements) {
    if (element instanceof HTMLDetailsElement) element.open = false
    element.style.cssText = 'position:static;width:auto;max-height:none;margin-top:10px'
    development.append(element)
  }
  panel.append(development)
  if (mountBrowserPanel) document.body.append(panel)
  xr.calibrationScreen!.qualityMenu = menu
  applyLive()
}
