import * as THREE from 'three'
import { lightingDefaults } from '../../config/lighting.js'
import { CarLights, type LampBinding } from '../../render/entity/car-lights.js'
import { addWebGPUMaterialNodes, type NodeKit } from '../../render/webgpu-substitutes.js'

// TSL nodes are typed loosely here.
type LampNode = any // eslint-disable-line @typescript-eslint/no-explicit-any
/** A lamp lens region on the geometry position, as a TSL boolean. */
type LampCondition = (position: LampNode) => LampNode

/**
 * WebGPU twin of the `masked` patch: outside the region a signal lens is discarded (colour pass
 * only, as the GLSL depth material is not patched) and the other lenses emit nothing.
 */
function lampMaskNodes(
  twin: THREE.Material,
  { tsl }: NodeKit,
  kind: 'brake' | 'reverse' | 'signal',
  lit: LampCondition,
): void {
  const t = tsl as LampNode
  const node = twin as THREE.Material & Record<string, LampNode>
  const inside = lit(t.varying(t.positionGeometry))
  if (kind === 'signal') {
    node.maskNode = inside
    node.maskShadowNode = t.bool(true)
  } else node.emissiveNode = inside.select(t.materialEmissive, t.vec3(0))
}

export function createA3Lights(model: THREE.Object3D): CarLights {
  const lamps: LampBinding[] = []
  function masked(
    material: THREE.MeshStandardMaterial,
    kind: 'brake' | 'reverse' | 'signal',
    color: string,
    condition: string,
    side: number,
    /** The same `condition` on the geometry position, as TSL (WebGPU twin). */
    lit: LampCondition,
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
    addWebGPUMaterialNodes(material, (kit, twin) => lampMaskNodes(twin, kit, kind, lit))
    lamps.push({ material, kind, side })
  }
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial))
      return
    let material = object.material
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
    // The separated outer cover is breakable; internal optics and LED strips are not.
    if (front && material.name === 'Foco 5') object.userData.breakableGlass = true
    // Each side needs independent emissive state, even when glTF shares its material.
    const positionLed = front && ['FocoC', 'LED', 'LED BLANCO NARANJA'].includes(material.name)
    if (positionLed) {
      material = material.clone()
      object.material = material
    }
    // Internal optical sleeves are solid reflectors, not a second transparent cover.
    // Keep the separate Foco 5 exterior glazing untouched.
    if (front && material.name === 'Foco 2') {
      material = material.clone()
      object.material = material
      material.transparent = false
      material.opacity = 1
      material.depthWrite = true
      material.side = THREE.DoubleSide
      material.emissive.set(0x000000)
      material.emissiveIntensity = 0
    }
    // Glazing should blend over the emitters, never occlude later transparent surfaces.
    if ((front || rearSide || trunk) && material.transparent) material.depthWrite = false
    if (front && !material.transparent && !positionLed) {
      // Preserve every authored glass material (including the separate Foco 5 cover).
      // Only opaque internal reflectors receive the polished grey finish.
      material.transparent = false
      material.opacity = 1
      material.depthWrite = true
      material.alphaTest = 0
      material.map = null
      material.alphaMap = null
      material.color.set('#858b93')
      material.metalness = 0.55
      material.roughness = 0.26
      material.needsUpdate = true
    }
    if (front && ['CORTA', 'Larga'].includes(material.name)) {
      material.emissive.set('#ffffff')
      material.toneMapped = false
      material.side = THREE.DoubleSide
      material.emissiveIntensity = 0
      lamps.push({
        material,
        kind: material.name === 'CORTA' ? 'low' : 'high',
        side: 0,
        dedicatedPosition: true,
      })
      return
    }
    if (positionLed) {
      material.emissive.set('#ffffff')
      material.toneMapped = false
      lamps.push({
        material,
        kind: 'front-signal',
        side: right || ancestors.includes('foco derecho') ? 1 : -1,
        dedicatedPosition: true,
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
        (p) =>
          p.y
            .greaterThan(0.01)
            .and(p.y.lessThan(0.053))
            .and(p.x.lessThan(0.21).or(p.x.greaterThan(0.894))),
      )
    if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
      lamps.push({ material, kind: 'position', side: 0 })
      material.emissiveIntensity = 0
    }
    if (rearSide && material.name === 'Rojo 6')
      masked(material, 'brake', '#ff0800', `${right ? '-' : ''}vLampPosition.y < 0.075`, 0, (p) =>
        (right ? p.y.negate() : p.y).lessThan(0.075),
      )
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
        masked(lamp.material, 'signal', '#ff7300', 'vLampPosition.x < 0.552', 1, (p) =>
          p.x.lessThan(0.552),
        )
        const other = new THREE.Mesh(geometry.clone(), lamp.material.clone())
        object.add(other)
        masked(other.material, 'signal', '#ff7300', 'vLampPosition.x >= 0.552', -1, (p) =>
          p.x.greaterThanEqual(0.552),
        )
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
  headBeams(model)
  return new CarLights(lamps, 450)
}

/**
 * Focused low and high beams at the two front lamp units, set up like the white truck's GLB lamps
 * (same candela, reach and cones; low beams use the shared cut-off projection). They are plain
 * `vehicle-light` nodes, so `AuthoredVehicleLights` switches them with the car's light controller
 * and the shared vehicle light rig copies them only while the car is occupied.
 */
/** The truck lamps' glTF colour (linear 1, 0.95, 0.87). */
const BEAM_COLOR = new THREE.Color().setRGB(1, 0.95, 0.87, THREE.LinearSRGBColorSpace)

export function headBeams(model: THREE.Object3D): THREE.SpotLight[] {
  const units: { side: 'L' | 'R'; center: THREE.Vector3 }[] = []
  model.updateWorldMatrix(true, true)
  const box = new THREE.Box3()
  model.traverse((object) => {
    const name = object.name.replaceAll('_', ' ').toLowerCase()
    if (name !== 'foco izquierdo' && name !== 'foco derecho') return
    box.setFromObject(object)
    if (box.isEmpty()) return
    const center = model.worldToLocal(box.getCenter(new THREE.Vector3()))
    units.push({ side: name === 'foco derecho' ? 'R' : 'L', center })
  })
  if (!units.length) return []
  // The lamp units sit at the nose: that end of the model's Z axis is forward.
  const forward = Math.sign(units[0].center.z) || 1
  const tilt = lightingDefaults.headlightTilt
  const beams: THREE.SpotLight[] = []
  for (const { side, center } of units)
    for (const high of [false, true]) {
      const owner = new THREE.Object3D()
      owner.name = `${high ? 'HighBeam' : 'LowBeam'}_Light_${side}`
      owner.userData = {
        role: 'vehicle-light',
        channel: high ? 'HighBeam' : 'LowBeam',
        side,
        onIntensity: high ? lightingDefaults.highBeamIntensity : lightingDefaults.lowBeamIntensity,
        ...(high ? {} : { beamPattern: 'low-beam' }),
      }
      owner.position.copy(center).add(new THREE.Vector3(0, 0, 0.05 * forward))
      const inner = high ? lightingDefaults.highBeamInnerCone : lightingDefaults.lowBeamInnerCone
      const outer = high ? lightingDefaults.highBeamOuterCone : lightingDefaults.lowBeamOuterCone
      const range = high ? lightingDefaults.highBeamRange : lightingDefaults.lowBeamRange
      // glTF cone convention, as GLTFLoader builds the truck's lamps.
      const light = new THREE.SpotLight(BEAM_COLOR, 0, range, outer, 1 - inner / outer, 2)
      light.castShadow = false
      light.visible = false
      light.target.position.set(0, -Math.sin(tilt), Math.cos(tilt) * forward)
      light.add(light.target)
      owner.add(light)
      model.add(owner)
      beams.push(light)
    }
  return beams
}
