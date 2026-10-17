/** Capability reporting only: never gate XR entry on a guessed hardware category. */
export function xrDeviceHint(userAgent: string, mobile?: boolean): string {
  if (/Quest|OculusBrowser/i.test(userAgent)) return 'Casco Meta Quest (probable; navegador)'
  if (/PicoBrowser|PICO/i.test(userAgent)) return 'Casco PICO (probable; navegador)'
  if (/iPhone/i.test(userAgent)) return 'Móvil iPhone (probable; navegador)'
  if (/iPad/i.test(userAgent)) return 'Tablet iPad (probable; navegador)'
  if (/Android/i.test(userAgent))
    return mobile === false
      ? 'Android (tipo no confirmado)'
      : 'Móvil/tablet Android (probable; navegador)'
  if (mobile) return 'Móvil (probable; navegador)'
  return 'Dispositivo no confirmado (ordenador, tablet o casco conectado)'
}

export interface XRDeviceReport {
  device: string
  session: string
  features: string[] | null
  inputs: {
    hand: string
    ray: string
    profiles: string[]
    handTracking: boolean
    buttons: number
    axes: number
  }[]
  gamepads: { name: string; mapping: string; buttons: number; axes: number }[]
  gamepadAccess: boolean
}

/** XR input sources and ordinary gamepads are separate lists; neither identifies transport. */
export function inspectXRDevice(
  nav: Pick<Navigator, 'userAgent' | 'getGamepads'> & { userAgentData?: { mobile?: boolean } },
  session?: XRSession | null,
): XRDeviceReport {
  let gamepads: XRDeviceReport['gamepads'] = [],
    gamepadAccess = true
  try {
    gamepads = Array.from(nav.getGamepads())
      .filter((pad): pad is Gamepad => !!pad && pad.connected && pad.mapping !== 'xr-standard')
      .map((pad) => ({
        name: pad.id || 'Gamepad sin nombre',
        mapping: pad.mapping || 'sin mapeo estándar',
        buttons: pad.buttons.length,
        axes: pad.axes.length,
      }))
  } catch {
    gamepadAccess = false
  }
  return {
    device: xrDeviceHint(nav.userAgent, nav.userAgentData?.mobile),
    session: session
      ? `${session.environmentBlendMode} · ${session.interactionMode ?? 'interacción no indicada'} · ${session.visibilityState}`
      : 'Sin sesión XR activa',
    features: session
      ? Array.from(
          (session as XRSession & { enabledFeatures?: readonly string[] }).enabledFeatures ?? [],
        )
      : null,
    inputs: session
      ? Array.from(session.inputSources).map((source) => ({
          hand: source.handedness,
          ray: source.targetRayMode,
          profiles: [...source.profiles],
          handTracking: !!source.hand,
          buttons: source.gamepad?.buttons.length ?? 0,
          axes: source.gamepad?.axes.length ?? 0,
        }))
      : [],
    gamepads,
    gamepadAccess,
  }
}
