import type { GameRuntime } from '../browser.js'

/** Browser-side calibration, saved on this device and explicitly shared by the user. */
export function bindXRCalibration(runtime: GameRuntime): void {
  const calibration = runtime.xr.calibration
  type Id = Parameters<typeof calibration.get>[0]
  type Pose = ReturnType<typeof calibration.get>
  const panel = document.createElement('details')
  panel.id = 'xr-calibration'
  panel.style.cssText =
    'position:fixed;left:12px;top:12px;z-index:10003;width:min(340px,calc(100vw - 100px));max-height:85vh;overflow:auto;background:#102632f5;color:#eefaff;border:1px solid #79bad4;border-radius:10px;padding:12px;font:14px system-ui;box-sizing:border-box'
  const title = document.createElement('summary')
  title.textContent = 'Ajustes VR'
  title.style.cursor = 'pointer'
  panel.append(title)
  const note = document.createElement('p')
  note.textContent =
    'Ajustes sobre tu nueva postura por defecto. Cero conserva esa postura. Pistola en funda y pistola en mano son independientes. Posición en cm; giro en grados. Cada ajuste compartido actúa sobre ambos lados en espejo. Ajusta el lado izquierdo con la mano derecha. Se guardan en este navegador. Ajusta aquí o usa la pantalla grande dentro de VR.'
  const select = document.createElement('select')
  select.id = 'xr-calibration-object'
  select.setAttribute('aria-label', 'Objeto VR')
  select.style.cssText = 'width:100%;padding:8px;margin-bottom:12px'
  for (const [id, name] of Object.entries(calibration.editableObjects)) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = name
    select.append(option)
  }
  panel.append(note, select)
  const labels = new Map<keyof Pose, Text>()
  const inputs = new Map<keyof Pose, HTMLInputElement>()
  const status = document.createElement('output')
  status.setAttribute('role', 'status')
  status.style.cssText = 'display:block;margin-top:8px'
  const refresh = () => {
    const pose = calibration.get(select.value as Id)
    const fields = calibration.fields(select.value as Id)
    for (const [key, input] of inputs) {
      input.value = String(pose[key])
      input.step = String(fields[key].step)
      labels.get(key)!.textContent = fields[key].label + ' · ' + fields[key].unit
    }
  }
  for (const [key, label] of Object.entries({
    x: 'Posición X · derecha (+)',
    y: 'Posición Y · arriba (+)',
    z: 'Posición Z · atrás (+)',
    rx: 'Giro X',
    ry: 'Giro Y',
    rz: 'Giro Z',
  }) as [keyof Pose, string][]) {
    const row = document.createElement('label')
    row.style.cssText =
      'display:grid;grid-template-columns:1fr 88px;gap:8px;align-items:center;margin-bottom:8px'
    const text = document.createTextNode(label)
    labels.set(key, text)
    row.append(text)
    const input = document.createElement('input')
    input.type = 'number'
    input.step = key.startsWith('r') ? '1' : '0.5'
    input.min = '-360'
    input.max = '360'
    input.id = `xr-adjust-${key}`
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:6px'
    input.oninput = () => {
      if (!input.validity.valid || !Number.isFinite(input.valueAsNumber)) return
      calibration.set(select.value as Id, { [key]: input.valueAsNumber })
      refresh()
      status.textContent = 'Ajuste aplicado'
    }
    row.append(input)
    panel.append(row)
    inputs.set(key, input)
  }
  select.onchange = () => {
    refresh()
    status.textContent = ''
  }
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:12px'
  const button = (label: string, action: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText = 'padding:8px;cursor:pointer'
    b.onclick = action
    actions.append(b)
    return b
  }
  const message = () =>
    `Mis ajustes VR de Nabla\nObjeto seleccionado: ${calibration.objects[select.value as Id]}\n${calibration.export()}`
  button('Pantalla grande en VR', () => {
    runtime.xr.showCalibrationScreen()
    runtime.xr.calibrationScreen!.development = true
    status.textContent = 'Pantalla preparada: entra en VR. El icono ⚙ permite traerla delante.'
  })
  button('Restablecer objeto', () => {
    calibration.reset(select.value as Id)
    refresh()
    status.textContent = 'Objeto restablecido'
  })
  button('Copiar ajustes', () => {
    void navigator.clipboard
      .writeText(message())
      .then(() => {
        status.textContent = 'Ajustes copiados'
      })
      .catch(() => {
        status.textContent = 'No se pudo copiar; usa Descargar JSON.'
      })
  })
  button('Compartir ajustes', () => {
    const text = message()
    if (navigator.share) {
      void navigator.share({ title: 'Ajustes VR · Nabla', text }).catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          status.textContent = 'No se pudo compartir; usa WhatsApp o Copiar ajustes.'
      })
    } else
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer',
      )
  })
  button('WhatsApp', () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message())}`,
      '_blank',
      'noopener,noreferrer',
    )
  })
  button('Descargar JSON', () => {
    const url = URL.createObjectURL(new Blob([calibration.export()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'nabla-ajustes-vr.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  panel.append(actions, status)
  for (const event of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click'])
    panel.addEventListener(event, (e) => e.stopPropagation())
  document.body.append(panel)
  refresh()
}
