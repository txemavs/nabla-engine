import * as THREE from 'three'
import { CarLights, type LampBinding } from '../../render/entity/car-lights.js'

export function createA3Lights(model: THREE.Object3D): CarLights {
  const lamps: LampBinding[] = []
  function masked(
    material: THREE.MeshStandardMaterial,
    kind: 'brake' | 'reverse' | 'signal',
    color: string,
    condition: string,
    side: number,
  ): void {
    material.emissive.set(color)
    material.emissiveIntensity = 0
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 vLampPosition;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvLampPosition = position;',
        )
      shader.fragmentShader =
        'varying vec3 vLampPosition;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\nif (!(${condition})) ${kind === 'signal' ? 'discard;' : 'totalEmissiveRadiance = vec3(0.0);'}`,
        )
    }
    material.customProgramCacheKey = () => `a3-lamp:${kind}:${condition}`
    lamps.push({ material, kind, side })
  }
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial))
      return
    const material = object.material
    let node: THREE.Object3D | null = object
    const ancestors: string[] = []
    while (node && node !== model) {
      ancestors.push(node.name.replaceAll('_', ' ').toLowerCase())
      node = node.parent
    }
    const rearSide = ancestors.some((n) => n === 'luz izquierda' || n === 'luz derecha')
    const trunk = ancestors.includes('luces maletero')
    const right = ancestors.includes('luz derecha')
    const front = ancestors.includes('foco izquierdo') || ancestors.includes('foco derecho')
    // Glazing should blend over the emitters, never occlude later transparent surfaces.
    if ((front || rearSide || trunk) && material.transparent) material.depthWrite = false
    if (front && material.name === 'FocoC') {
      lamps.push({
        material,
        kind: 'front-signal',
        side: ancestors.includes('foco derecho') ? 1 : -1,
      })
      material.emissiveIntensity = 0
      return
    }
    // Emit on the outer lens: the former inner emitter was hidden by PilotoFino.
    if (trunk && ['PilotoFino', 'PilotoRojo', 'Plastico 3'].includes(material.name))
      masked(
        material,
        'reverse',
        '#ffffff',
        'vLampPosition.y > 0.01 && vLampPosition.y < 0.053 && (vLampPosition.x < 0.21 || vLampPosition.x > 0.894)',
        0,
      )
    if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
      lamps.push({ material, kind: 'position', side: 0 })
      material.emissiveIntensity = 0
    }
    if (rearSide && material.name === 'Rojo 6')
      masked(material, 'brake', '#ff0800', `${right ? '-' : ''}vLampPosition.y < 0.075`, 0)
    // Independent upper amber strips, selected manually; the lower lens never flashes.
    if ((rearSide || trunk) && material.name === 'Rojo 6') {
      const source = object.geometry
      const pos = source.getAttribute('position'),
        index = source.getIndex()
      const indices: number[] = []
      for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
        const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j))
        const y = (ids.reduce((sum, id) => sum + pos.getY(id), 0) / 3) * (right ? -1 : 1)
        if (rearSide && y <= 0.078) continue
        indices.push(...ids)
      }
      if (!indices.length) return
      const geometry = source.clone()
      geometry.setIndex(indices)
      const lamp = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: '#36210c',
          emissive: '#ff7300',
          emissiveIntensity: 0,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      )
      object.add(lamp)
      // Trunk has both strips in one primitive; use local X to address each half.
      if (trunk) {
        masked(lamp.material, 'signal', '#ff7300', 'vLampPosition.x < 0.552', 1)
        const other = new THREE.Mesh(geometry.clone(), lamp.material.clone())
        object.add(other)
        masked(other.material, 'signal', '#ff7300', 'vLampPosition.x >= 0.552', -1)
        lamps[lamps.length - 2].mesh = lamp
        lamps[lamps.length - 1].mesh = other
      } else
        lamps.push({
          material: lamp.material,
          kind: 'signal',
          side: right ? 1 : -1,
          mesh: lamp,
        })
      lamp.visible = false
    }
  })

  if (!lamps.length) console.warn('S3 lamps omitted: no matching lens nodes')
  return new CarLights(lamps)
}
