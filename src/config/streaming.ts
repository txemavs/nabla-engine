/** Gameplay terrain scheduling defaults; quality presets supply tile/cache limits. */
export const streamingDefaults = Object.freeze({
  /** Minimum interval between terrain demand updates, milliseconds (exclusive). */
  sampleIntervalMs: 500,
  /** Terrain installation budget per browser frame, milliseconds. */
  installBudgetMs: 1.5,
  /** Mobile terrain installation budget per frame, milliseconds. */
  mobileInstallBudgetMs: 1,
  /** Scene map installation budget per frame, milliseconds. */
  mapInstallBudgetMs: 4,
  /** Maximum map objects installed in one frame. */
  mapInstallCount: 24,
  /** Distance from scene origin before rebasing render coordinates, metres. */
  floatingOriginDistance: 10_000,
})
