import { monitorStyleText } from '../ui/styles.js'

/** Engine-owned CSS3D instrument styles (src/ui/styles/monitors.css), installed per monitor layer. */
export function vehicleMonitorStyleText(): string {
  return monitorStyleText
}

export const VEHICLE_MONITOR_STYLE_ID = 'nabla-vehicle-monitor-styles'

/**
 * Install (or refresh) the shared monitor stylesheet under `parent`.
 * VehicleMonitors and the game settings window both call this so a style change
 * restyles every host. A ship monitor can mount the settings panel later by
 * appending the panel root into its CSS3D layer after installing these styles.
 */
export function installVehicleMonitorStyles(parent: ParentNode = document.head): HTMLStyleElement {
  const doc = parent.ownerDocument ?? (parent as Document)
  const existing = doc.getElementById(VEHICLE_MONITOR_STYLE_ID)
  if (existing instanceof HTMLStyleElement) {
    existing.textContent = vehicleMonitorStyleText()
    if (existing.parentNode !== parent) parent.appendChild(existing)
    return existing
  }
  const style = doc.createElement('style')
  style.id = VEHICLE_MONITOR_STYLE_ID
  style.textContent = vehicleMonitorStyleText()
  parent.appendChild(style)
  return style
}
