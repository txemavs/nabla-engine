import { planetaryScene } from './planet-scene.js'
import { createRealWorld } from '../src/planet/assemble/world.js'
import { createProject, parseProject } from './project.js'
import { upgradeReferenceScene } from './scene-upgrades.js'
import { createSampleScene } from '../src/stage/sample.js'
import { parseScene } from '../src/stage/scene.js'
import { alignCircuitPlan } from '../src/stage/circuit-plan.js'
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
