import { isCalibrationKey, isPreferenceKey } from '../src/runtime/settings-backup.js'
/** Legacy API: clear game preferences while retaining physical controller calibration. */
export function resetGameSettings(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
  for (const key of keys)
    if (key && isPreferenceKey(key) && !isCalibrationKey(key)) storage.removeItem(key)
}
