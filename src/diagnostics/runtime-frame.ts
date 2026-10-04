/** Optional browser-runtime measurements. CPU durations are submission time, never GPU time. */
export interface RuntimeFrameSample {
  /** Uncapped animation interval in milliseconds; zero for the first frame. */
  frameMs: number
  /** Total main-thread frame work in milliseconds, excluding observer callbacks. */
  cpuMs: number
  /** Simulation submission including collision preparation, milliseconds. */
  physicsMs: number
  /** Terrain/map installation and collision handover before simulation, milliseconds. */
  installMs: number
  /** Draw calls and triangles across all main/auxiliary passes in this frame. */
  calls: number
  triangles: number
  /** Actual drawing-buffer dimensions in pixels after quality scaling. */
  width: number
  height: number
  /** Accumulated physics time discarded by the bounded catch-up policy, seconds. */
  droppedSeconds: number
}
