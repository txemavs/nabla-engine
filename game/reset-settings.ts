import { isCalibrationKey, isPreferenceKey } from '../src/runtime/settings-backup.js'
/** Legacy API: clear game preferences while retaining physical controller calibration. */
export function resetGameSettings(storage: Storage): void {
  for (const key of Object.keys(storage))
    if (isPreferenceKey(key) && !isCalibrationKey(key)) storage.removeItem(key)
}
