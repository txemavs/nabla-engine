/** Bottom HUD line: renderer, fps, CPU frame time and, when the GPU timer has a value, GPU time. */
import type { RuntimeFrameSample } from '@nabla/engine/runtime/browser'

/** Frame-sample handler that rewrites `element` about twice a second; `forward` keeps any other listener. */
export function fpsReadout(
  element: () => HTMLElement | null,
  forward?: (sample: RuntimeFrameSample) => void,
): (sample: RuntimeFrameSample) => void {
  let frames = 0
  let cpuMs = 0
  let gpuMs = 0
  let gpuFrames = 0
  let start = performance.now()
  return (sample) => {
    forward?.(sample)
    frames++
    cpuMs += sample.cpuMs
    const gpu = sample.gpuTiming?.frameMs
    if (gpu !== undefined && gpu > 0) {
      gpuMs += gpu
      gpuFrames++
    }
    const now = performance.now()
    if (now - start < 500) return
    const el = element()
    if (el) {
      const parts = [
        sample.backend === 'webgpu' ? 'WebGPU' : 'WebGL',
        `${Math.round((frames * 1000) / (now - start))} fps`,
        `${(cpuMs / frames).toFixed(1)} ms`,
      ]
      if (gpuFrames) parts.push(`GPU ${(gpuMs / gpuFrames).toFixed(1)} ms`)
      el.textContent = parts.join(' · ')
    }
    frames = cpuMs = gpuMs = gpuFrames = 0
    start = now
  }
}
