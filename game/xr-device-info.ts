import { inspectXRDevice } from '@nabla/engine/ar'

/** Shared launcher/standalone report. Session details remain available after leaving XR. */
export function mountXRDeviceInfo(host: HTMLElement) {
  const existing = document.getElementById('xr-device-info') as
    (HTMLElement & { inspector?: ReturnType<typeof createInspector> }) | null
  if (existing?.inspector) return existing.inspector
  const box = document.createElement('details') as HTMLElement & {
    inspector?: ReturnType<typeof createInspector>
  }
  box.id = 'xr-device-info'
  const summary = document.createElement('summary')
  summary.textContent = 'Dispositivo y controles'
  const text = document.createElement('div')
  const copy = document.createElement('button')
  copy.textContent = 'Copiar información'
  box.append(summary, text, copy)
  host.append(box)
  box.inspector = createInspector(summary, text, copy)
  return box.inspector
}
function createInspector(summary: HTMLElement, text: HTMLElement, copy: HTMLButtonElement) {
  let session: XRSession | null = null
  let support = 'Comprobando VR/AR…',
    lastSession = '',
    environment = '',
    lastFrame = -Infinity
  const lines = () => {
    const report = inspectXRDevice(navigator, session)
    return [
      report.device,
      support,
      report.session,
      ...(session
        ? [
            `Funciones concedidas: ${report.features?.join(', ') || 'no indicadas'}`,
            ...report.inputs.map(
              (input) =>
                `XR ${input.hand}: ${input.handTracking ? 'mano' : input.ray} · ${input.profiles.join(', ') || 'sin perfil'} · ${input.buttons} botones / ${input.axes} ejes`,
            ),
            ...(report.inputs.length ? [] : ['Sin entradas XR detectadas']),
            environment,
          ]
        : lastSession
          ? [`Última sesión: ${lastSession}`]
          : []),
      ...report.gamepads.map(
        (pad) =>
          `Gamepad: ${pad.name} · ${pad.mapping} · ${pad.buttons} botones / ${pad.axes} ejes`,
      ),
      report.gamepads.length
        ? 'Conexión Bluetooth/USB: no confirmable por esta API.'
        : report.gamepadAccess
          ? 'Sin gamepads visibles. Pulsa un botón del mando para que el navegador pueda detectarlo.'
          : 'El navegador no permite consultar gamepads.',
      'Demo AR actual: requiere unbounded y local-floor. Compatibilidad AR no garantiza esas funciones.',
    ].filter(Boolean)
  }
  const refresh = () => {
    const current = lines()
    summary.textContent = current[0]
    text.textContent = current.join('\n')
  }
  const ended = () => {
    lastSession = lines().slice(2).join(' · ')
    session?.removeEventListener('inputsourceschange', refresh)
    session = null
    refresh()
  }
  const setSession = (next: XRSession | null) => {
    session?.removeEventListener('inputsourceschange', refresh)
    session?.removeEventListener('end', ended)
    session = next
    environment = ''
    lastFrame = -Infinity
    session?.addEventListener('inputsourceschange', refresh)
    session?.addEventListener('end', ended)
    refresh()
  }
  const interval = window.setInterval(refresh, 1000)
  addEventListener(
    'pagehide',
    () => {
      clearInterval(interval)
      setSession(null)
    },
    { once: true },
  )
  copy.onclick = () => {
    void navigator.clipboard.writeText(lines().join('\n')).then(
      () => {
        copy.textContent = 'Copiado'
      },
      () => {
        copy.textContent = 'Selecciona y copia el texto'
      },
    )
  }
  void Promise.all(
    ['immersive-vr', 'immersive-ar'].map(async (mode) => {
      try {
        return !!navigator.xr && (await navigator.xr.isSessionSupported(mode as XRSessionMode))
      } catch {
        return false
      }
    }),
  ).then(([vr, ar]) => {
    support = `Navegador: VR ${vr ? 'sí' : 'no'} · AR ${ar ? 'sí' : 'no'} (no identifica un casco)`
    refresh()
  })
  refresh()
  return {
    setSession,
    lines,
    updateFrame(frame: XRFrame, time: number) {
      if (time - lastFrame < 1000) return
      lastFrame = time
      const data = frame as XRFrame & {
        detectedPlanes?: Set<unknown>
        detectedMeshes?: Set<unknown>
      }
      environment = `Entorno observado: planos ${data.detectedPlanes?.size ?? 'no expuestos'} · mallas ${data.detectedMeshes?.size ?? 'no expuestas'}`
      refresh()
    },
  }
}
