import type { WebGLRenderer } from 'three'

interface PendingProgram {
  program?: unknown
  isReady(): boolean
}

/** Poll the programs requested by this compile, not mutable material.currentProgram.
 * Rendering mirrors/intro frames can replace or destroy that program while we wait.
 * Never query a deleted GL handle. Readiness, not a time budget, completes warmup.
 */
export function installShaderWarmup(renderer: WebGLRenderer): void {
  renderer.compileAsync = async (scene, camera, targetScene) => {
    const materials = renderer.compile(scene, camera, targetScene)
    const pending = new Set<PendingProgram>()
    for (const material of materials) {
      const properties = renderer.properties.get(material) as { currentProgram?: PendingProgram }
      if (properties.currentProgram) pending.add(properties.currentProgram)
    }
    while (pending.size) {
      if (renderer.getContext().isContextLost())
        throw new Error('Shader warmup: WebGL context lost')
      for (const program of pending)
        if (program.program === undefined || program.isReady()) pending.delete(program)
      if (!pending.size) break
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
    return scene
  }
}
