import type { SceneDocument } from '../scene/document.js'
import { createRuntimeText, type RuntimeText } from './messages.js'
import type { SceneView } from '../presentation/scene-view.js'

/** Equipment actions shared by game hosts. Persistence is a host concern. */
export function vehicleMenuKey(
  view: SceneView,
  document: SceneDocument,
  id: string,
  code: string,
  repeat: boolean,
  report: (message: string) => void,
  update: (id: string, patch: Partial<SceneDocument['entities'][number]>) => void,
  text: RuntimeText = createRuntimeText(),
  /** Engine mode from the «MOTOR» page; returns the HUD message (see `Simulation.setEngineMode`). */
  engineMode?: (id: string, mode: 'normal' | 'beast') => string,
  /** «VISTA FOV» page: a signed degree step or `reset`; returns the HUD message. */
  fov?: (action: string) => string,
): { handled: boolean; opened?: boolean } {
  if (code === 'KeyJ') {
    if (repeat) return { handled: true }
    const opened = view.toggleVehicleMenu(id)
    if (opened !== null)
      report(opened ? text('Vehicle menu · arrows and Enter · J to close') : text('Menu closed'))
    return { handled: true, opened: opened ?? undefined }
  }
  const menu = view.vehicleMenu(id)
  if (!menu?.open) return { handled: false }
  const result = menu.key(code)
  const action = result.action
  if (action?.type === 'vehicle.mirror') {
    const vehicle = document.entities.find((e) => e.id === id)?.vehicle
    if (vehicle) {
      const tilt = Math.max(-5, Math.min(12, (vehicle.mirrorTilt ?? -2) + Number(action.value)))
      update(id, { vehicle: { ...vehicle, mirrorTilt: tilt } })
      view.setVehicleMirrorTilt(id, tilt)
      report(text('Mirrors: ') + tilt + text(' degrees'))
    }
  }
  if (action?.type === 'vehicle.map') {
    const follow = action.value !== 'north'
    view.setVehicleMapFollow(id, follow)
    report(follow ? text('Map follows vehicle') : text('North-up map'))
  }
  if (action?.type === 'vehicle.fov' && action.value && fov) report(fov(action.value))
  if (action?.type === 'vehicle.engine' && engineMode)
    report(engineMode(id, action.value === 'beast' ? 'beast' : 'normal'))
  if (
    (action?.type === 'vehicle.paint' || action?.type === 'vehicle.paintFinish') &&
    action.value
  ) {
    const finish = action.type === 'vehicle.paintFinish' ? 'chrome' : 'paint'
    const color = finish === 'chrome' ? '#ffffff' : action.value
    const vehicle = document.entities.find((e) => e.id === id)?.vehicle
    update(id, { color, ...(vehicle ? { vehicle: { ...vehicle, paintFinish: finish } } : {}) })
    view.setVehiclePaint(id, color, finish)
    report(text('Paint applied'))
  }
  return { handled: result.handled }
}
