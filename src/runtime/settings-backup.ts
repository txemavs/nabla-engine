import { parseUsbSettings } from './usb/controllers.js'
/** Explicit preference catalog: never export scenes, credentials, terrain caches or reports. */
export const preferenceKeys = new Set([
  'nabla.anisotropy',
  'nabla.groundDetailCells',
  'nabla.asphaltContrast',
  'nabla.terrain.source',
  'nabla.terrain.layers',
  'nabla.flipCinematic',
  'nabla.recoverToRoad',
  'nabla.shadowBias',
  'nabla.shadowsEnabled',
  'nabla.truckExhaustOffset',
  'nabla.truckExhaustAmount',
  'nabla.audioMix',
  'nabla.cameraFov',
  'nabla.driverPose',
  'nabla.bodycam',
  'nabla.actionCam',
  'nabla.actionCamSettings',
  'nabla.tunnel',
  'nabla.smoke',
  'nabla.smokePercent',
  'nabla.weaponPoses',
  'nabla.weaponWheel',
  'nabla.muzzleFlash',
  'nabla.lightTuning',
  'nabla.planetVisual',
  'nabla.sidearmTuning',
  'nabla.usb.controllers.v1',
  'nabla.xr.quality.v1',
  'nabla.xr.truck-zero',
  'nabla.ar.collisions',
  'nabla.ar.map-scale',
  'nabla.xr.calibration.v2',
  'nabla.xr.calibration.v3',
  'nabla.xr.calibration.v4',
  'nabla.xr.calibration.v5',
])
export const preferenceQueryKeys = new Set([
  'quality',
  'fps',
  'scale',
  'photo',
  'relief',
  'meshMinZoom',
  'layers',
  'sea',
  'sky',
  'time',
  'timeSpeed',
  'shadowBias',
  'flipcam',
  'flipCinematic',
  'recoverToRoad',
  'roadReset',
  'inspectRoads',
  'wheel',
  'mirrors',
  'engineMode',
])
export const isPreferenceKey = (key: string): boolean =>
  preferenceKeys.has(key) ||
  key.startsWith('nabla.mirrors:') ||
  key.startsWith('nabla.vehicle-lights.') ||
  key.startsWith('nabla.steeringWheel:')
export const isCalibrationKey = (key: string): boolean =>
  key === 'nabla.usb.controllers.v1' ||
  key.startsWith('nabla.xr.calibration.') ||
  key === 'nabla.xr.truck-zero'
export interface PreferenceStorage {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export interface SettingsBackup {
  format: 'nabla-settings'
  version: 1
  createdAt: string
  local: Record<string, string>
  session: Record<string, string>
  query: Record<string, string>
}
function snapshot(storage: PreferenceStorage): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key && isPreferenceKey(key)) {
      const value = storage.getItem(key)
      if (value !== null) result[key] = value
    }
  }
  return result
}
export function exportSettingsBackup(
  local: PreferenceStorage,
  session: PreferenceStorage,
  search: string,
): SettingsBackup {
  const query: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(search))
    if (preferenceQueryKeys.has(key)) query[key] = value
  return {
    format: 'nabla-settings',
    version: 1,
    createdAt: new Date().toISOString(),
    local: snapshot(local),
    session: snapshot(session),
    query,
  }
}
export function parseSettingsBackup(text: string): SettingsBackup {
  if (text.length > 2 * 1024 * 1024) throw new Error('El archivo de ajustes supera 2 MB.')
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Archivo de ajustes inválido.')
  const data = value as Record<string, unknown>
  if (
    data.format !== 'nabla-settings' ||
    data.version !== 1 ||
    typeof data.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(data.createdAt)) ||
    Object.keys(data).some(
      (k) => !['format', 'version', 'createdAt', 'local', 'session', 'query'].includes(k),
    )
  )
    throw new Error('Formato o versión de ajustes no compatible.')
  for (const field of ['local', 'session', 'query'] as const) {
    const entries = data[field]
    if (
      !entries ||
      typeof entries !== 'object' ||
      Array.isArray(entries) ||
      Object.keys(entries).length > 512
    )
      throw new Error('Lista de ajustes inválida.')
    for (const [key, v] of Object.entries(entries)) {
      if (
        !(field === 'query' ? preferenceQueryKeys.has(key) : isPreferenceKey(key)) ||
        typeof v !== 'string' ||
        v.length > 512 * 1024
      )
        throw new Error(`Ajuste no admitido: ${key}`)
      if (key === 'nabla.usb.controllers.v1') parseUsbSettings(JSON.parse(v))
    }
  }
  return data as unknown as SettingsBackup
}
/** Both stores are rolled back if any write fails. Browser storage has no native transaction. */
function transaction(
  local: PreferenceStorage,
  session: PreferenceStorage,
  change: () => void,
): void {
  const before = [snapshot(local), snapshot(session)]
  try {
    change()
  } catch (error) {
    try {
      for (const [i, storage] of [local, session].entries()) {
        for (const key of Object.keys(snapshot(storage)))
          if (!(key in before[i])) storage.removeItem(key)
        for (const [key, value] of Object.entries(before[i]))
          if (storage.getItem(key) !== value) storage.setItem(key, value)
      }
    } catch {
      throw new Error(
        'No se pudieron aplicar ni restaurar todos los ajustes. Conserva el JSON de copia y comprueba el almacenamiento del navegador.',
      )
    }
    throw error
  }
}
export function applySettingsBackup(
  backup: SettingsBackup,
  local: PreferenceStorage,
  session: PreferenceStorage,
  search: string,
  replace = false,
): string {
  const data = parseSettingsBackup(JSON.stringify(backup))
  transaction(local, session, () => {
    for (const [i, storage] of [local, session].entries()) {
      const source = i === 0 ? data.local : data.session
      if (replace)
        for (const key of Object.keys(snapshot(storage)))
          if (!(key in source)) storage.removeItem(key)
      for (const [key, value] of Object.entries(source)) storage.setItem(key, value)
    }
  })
  const params = new URLSearchParams(search)
  if (replace) for (const key of preferenceQueryKeys) params.delete(key)
  for (const [key, value] of Object.entries(data.query)) params.set(key, value)
  return params.toString()
}
export function restoreSettingsDefaults(
  local: PreferenceStorage,
  session: PreferenceStorage,
  search: string,
  includeCalibrations = false,
): string {
  transaction(local, session, () => {
    for (const storage of [local, session])
      for (const key of Object.keys(snapshot(storage)))
        if (includeCalibrations || !isCalibrationKey(key)) storage.removeItem(key)
  })
  const params = new URLSearchParams(search)
  for (const key of preferenceQueryKeys) params.delete(key)
  return params.toString()
}
