import { planetaryScene } from './studio/planet-scene.js'
import { createRealWorld } from '../src/real-world.js'
import { createProject, parseProject } from './studio/project.js'
import { upgradeReferenceScene } from './scene-upgrades.js'
import { createSampleScene } from '../src/sample.js'
import { parseScene } from '../src/scene.js'
import { alignCircuitPlan } from '../src/circuit-plan.js'
self.onmessage = (
  event: MessageEvent<{
    project: string | null
    scene: string | null
    large: boolean
    extract?: boolean
  }>,
) => {
  try {
    const input = event.data
    self.postMessage({ stage: 'Leyendo y validando el proyecto…' })
    const project = input.project ? parseProject(JSON.parse(input.project), input.large) : undefined
    let scene = upgradeReferenceScene(
      input.extract
        ? createRealWorld(JSON.parse(input.scene!))
        : project
          ? project.locations.find((p) => p.id === project.activeLocation)!.scene
          : input.scene
            ? JSON.parse(input.scene)
            : createSampleScene(),
      input.large,
    )
    if (scene.entities.some((e) => e.id === 'road' && e.size[0] === 16 && e.size[2] === 85))
      scene = alignCircuitPlan(scene)
    scene = parseScene(planetaryScene(scene), input.large)
    if (project) for (const place of project.locations) place.scene = planetaryScene(place.scene)
    self.postMessage({ stage: 'Preparando objetos y terreno…' })
    self.postMessage({
      result: { project: project ?? createProject(scene), scene, saved: JSON.stringify(scene) },
    })
  } catch (error) {
    self.postMessage({ error: String(error) })
  }
}
