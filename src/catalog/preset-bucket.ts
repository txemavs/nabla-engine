/** Where a preset file lives: `library` ships with the engine, `custom` is this machine only. */
export type PresetBucket = 'library' | 'custom'

/** Bucket of a preset file path (node absolute path or a Vite glob key). */
export function presetBucket(file: string): PresetBucket {
  return /(?:^|[\\/])assets[\\/]custom[\\/]/.test(file) ? 'custom' : 'library'
}
