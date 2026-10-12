/** Only persisted game preferences; terrain data and unrelated origin storage survive. */
const keys = new Set([
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
  'nabla.bodycam',
  'nabla.tunnel',
  'nabla.smoke',
  'nabla.smokePercent',
  'nabla.weaponPoses',
  'nabla.lightTuning',
  'nabla.planetVisual',
  'nabla.sidearmTuning',
])
export function resetGameSettings(storage: Storage): void {
  for (const key of Object.keys(storage))
    if (keys.has(key) || key.startsWith('nabla.mirrors:') || key.startsWith('nabla.steeringWheel:'))
      storage.removeItem(key)
}
