import type { SceneDocument } from '../scene/document.js'
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
): { handled: boolean; opened?: boolean } {
  if (code === 'KeyJ') {
    if (repeat) return { handled: true }
    const opened = view.toggleVehicleMenu(id)
    if (opened !== null)
      report(opened ? 'Menú del coche · flechas y Enter · J para salir' : 'Menú cerrado')
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
      report('Espejos: ' + tilt + ' grados')
    }
  }
  if (action?.type === 'vehicle.map') {
    const follow = action.value !== 'north'
    view.setVehicleMapFollow(id, follow)
    report(follow ? 'Mapa sigue al coche' : 'Mapa clavado al norte')
  }
  if (action?.type === 'vehicle.paint' && action.value) {
    update(id, { color: action.value })
    view.setVehiclePaint(id, action.value)
    report('Color aplicado')
  }
  return { handled: result.handled }
}
