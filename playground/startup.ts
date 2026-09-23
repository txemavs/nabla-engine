import type { SceneDocument } from '../src/scene.js'
import type { StudioProject } from './studio/project.js'
export interface StartupResult {
  project: StudioProject
  scene: SceneDocument
  saved: string
}
/** The worker validates data before ownership passes to the editor. */
export function prepareStartup(
  project: string | null,
  scene: string | null,
  large: boolean,
  progress: (message: string) => void,
  extract = false,
): Promise<StartupResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./startup.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      if (event.data.stage) progress(event.data.stage)
      if (event.data.result) {
        worker.terminate()
        resolve(event.data.result)
      }
      if (event.data.error) {
        worker.terminate()
        reject(new Error(event.data.error))
      }
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('No se pudo preparar el proyecto'))
    }
    worker.postMessage({ project, scene, large, extract })
  })
}
