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
  /** Install budget while play() blocks on waitForGround (ms/tick). Larger than the
   * per-frame budget: the loop is not rendering yet, and 1.5ms/100ms made LiDAR cells
   * take minutes to stage. */
  blockingInstallBudgetMs: 12,
  /** Poll interval while play() blocks on waitForGround (ms). */
  blockingPollMs: 16,
  /** Distance from scene origin before rebasing render coordinates, metres. */
  floatingOriginDistance: 10_000,
})
