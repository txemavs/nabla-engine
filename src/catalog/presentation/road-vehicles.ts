import * as THREE from 'three'
import { CarMirrors, authoredMirrorSurfaces } from '../../render/entity/car-mirrors.js'
import { CarInstruments } from '../../render/entity/car-instruments.js'
import { PoliceEquipment } from './police-equipment.js'
import type {
  VehiclePresentationAdapter,
  VehiclePresentationResolver,
} from '../../render/vehicle-presentation/adapter.js'
import { createA3Lights } from './a3-lamps.js'
import { createA3Mounts } from './a3-mounts.js'
import { authoredMirrorLenses } from '../../render/vehicle-presentation/mirror-lenses.js'
import { authoredScreenMounts } from '../../render/vehicle-presentation/screen-mounts.js'
/**
 * Cab and trailer paint (`White paint`) plus the cargo-box skin (`Chassis B`).
 * The box mesh is named like a missing reference map and is authored at albedo ~0.02 with
 * metalness 0.45. Cars get no environment except tagged chrome, so that metal reflects
 * nothing and the trailer is a flat black silhouette (exact 0,0,0 on the shadow side).
 * The frame (`Chassis`, `Chassis C`) stays as authored.
 */
const truckPaintMaterial = /^White paint|^Chassis B/i

function paintWhiteBody(model: THREE.Object3D, color: string): void {
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (
        !(material instanceof THREE.MeshStandardMaterial) ||
        !truckPaintMaterial.test(material.name)
      )
        continue
      material.color.set(color)
      if (/^Chassis B/i.test(material.name)) {
        material.metalness = 0.08
        material.roughness = Math.max(material.roughness, 0.34)
      }
      material.needsUpdate = true
    }
  })
}

/**
 * Cabin cloth and plastic in the S3 / A3 GLB are authored at about 0.00–0.04 linear.
 * With no environment fill they crush to a flat black interior. Floor them to a dark
 * neutral so the cabin keeps a colour. TODO(unverified): no manufacturer swatch for these
 * factors; the floor only stops the crush, it is not a measured interior colour.
 */
const cabinMaterial = /^(Asiento|Plastico|Tela|Gris \d|Metal \d|Negro)/i
const cabinFloor = 0.16

function liftCabinColour(model: THREE.Object3D): void {
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !cabinMaterial.test(material.name))
        continue
      const { r, g, b } = material.color
      if (Math.max(r, g, b) >= 0.08) continue
      material.color.setRGB(cabinFloor, cabinFloor * 0.96, cabinFloor * 0.9)
      material.metalness = Math.min(material.metalness, 0.08)
      material.needsUpdate = true
    }
  })
}

/**
 * S3 / A3 body chrome: the window surrounds, beltline and boot trim and the grille (`Cromo …`)
 * and the badge (`Nabla silver chrome`). A metal shows only what it reflects and the scene has
 * no environment map, so on their own these parts showed little more than the sun's highlight
 * (dull grey or near black depending on the sun and the time of day). They are tagged
 * `reflective` and the entity view gives them the shared neutral reflection environment (the
 * same one as the VFR800 chrome, `applyReflectionEnvironment`, dimmed at night).
 */
export const s3ChromeMaterial = /^cromo|chrome/i

/**
 * Rear bumper parts authored as flat dark greys (0.08–0.35 linear, metalness 0): the twin
 * exhaust tips (`*26` outer sleeve, `*31` inner ring) and the chrome strip along the diffuser
 * (`Gris 1`). In shade they had only the ambient and read black. They become polished metal
 * with the reflection environment; the pipe bore (`*28`) stays black.
 */
const s3RearBumper = /^Parachoques[_ ]?Trasero/i
const s3RearChrome = /^(\*26|\*31|Gris 1)$/

/** Windscreen tint (`Gris Parabrisas`): glossy glass with a slight sky reflection. */
const s3Windscreen = /^Gris Parabrisas$/i

function shineVehicle(model: THREE.Object3D, kind: 'body' | 'wheel' | 'steering'): void {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      const rearBumper =
        s3RearBumper.test(object.name) || s3RearBumper.test(object.parent?.name ?? '')
      if (kind === 'body' && rearBumper && s3RearChrome.test(material.name)) {
        material.metalness = 1
        // The tips a little whiter than the strip; both slightly satin, like real exhaust chrome.
        const tip = material.name !== 'Gris 1'
        material.color.setRGB(tip ? 0.9 : 0.86, tip ? 0.9 : 0.86, tip ? 0.9 : 0.87)
        material.roughness = tip ? 0.22 : 0.2
        material.emissive.set(0, 0, 0)
        material.userData.nabla = { ...material.userData.nabla, reflective: true }
        material.needsUpdate = true
        continue
      }
      if (kind === 'body' && s3Windscreen.test(material.name)) {
        material.roughness = Math.min(material.roughness, 0.06)
        material.userData.nabla = {
          ...material.userData.nabla,
          reflective: true,
          envIntensity: 0.6,
        }
        material.needsUpdate = true
        continue
      }
      // The door mirror housings (`Llanta 2`, also the live mirror lenses) keep their satin look.
      if (/^llanta/i.test(material.name) && material.metalness > 0.5) {
        material.metalness = 0.35
        material.needsUpdate = true
      }
      if (kind !== 'body' || !s3ChromeMaterial.test(material.name)) continue
      material.metalness = 1
      // Bright chrome like the wheel rim lips, but whiter: the rims' base (0.86-0.93, roughness
      // 0.18) reads glossy black next to env-lit trim. The reflection follows the light
      // (`shadeEnvironment`), so a bright base never looks self-lit.
      material.color.setRGB(0.93, 0.93, 0.93)
      material.roughness = 0.15
      material.emissive.set(0, 0, 0)
      material.userData.nabla = { ...material.userData.nabla, reflective: true }
      material.needsUpdate = true
    }
  })
}

export const s3Presentation: VehiclePresentationAdapter = {
  mount(model, e, definition, policy) {
    liftCabinColour(model)
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      const next = materials.map((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial) || !/^pintura/i.test(material.name))
          return material
        // Black paint stays dark if the specular tint is the base colour. The coat is the shine.
        const paint = new THREE.MeshPhysicalMaterial({
          name: material.name,
          // Thin authored body panels need both faces for interior visibility and shadows.
          side: THREE.DoubleSide,
          shadowSide: THREE.DoubleSide,
          color: e.color,
          metalness: 0.72,
          roughness: 0.22,
          clearcoat: 0.8,
          clearcoatRoughness: 0.14,
        })
        // The clear coat reflects the sky, so a shaded or far panel keeps its colour instead of
        // going black (the entity view gives it the environment, `carReflectionOptions`).
        paint.userData.nabla = { reflective: true, envIntensity: 0.45 }
        return paint
      })
      object.material = Array.isArray(object.material) ? next : next[0]
    })

    const candidates: THREE.Mesh[] = []
    model.updateWorldMatrix(true, true)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
      model.getWorldQuaternion(new THREE.Quaternion()),
    )
    model.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        o.material instanceof THREE.MeshStandardMaterial &&
        o.material.name === 'Llanta 2'
      )
        candidates.push(o)
    })
    if (!candidates.length) console.warn('S3 mirrors omitted: missing lens material Llanta 2')
    const mounts = definition ? createA3Mounts(model, e.vehicle?.clusterOffset) : undefined
    const instruments = mounts && definition ? new CarInstruments(mounts, definition) : undefined
    if (instruments) instruments.mirrorTilt = e.vehicle?.mirrorTilt ?? -2
    return {
      lights: createA3Lights(model),
      mirrors: new CarMirrors(
        candidates,
        up,
        e.vehicle?.mirrorTilt ?? -2,
        policy,
        model.parent ?? model,
        e.vehicle?.mirrorAim,
      ),
      instruments,
    }
  },
  preparePart(model, kind) {
    shineVehicle(model, kind)
  },
  paint(model, color) {
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material])
        if (material instanceof THREE.MeshStandardMaterial && /^Pintura/.test(material.name))
          material.color.set(color)
    })
  },
}
export const wranglerPresentation: VehiclePresentationAdapter = {
  mount(model, e) {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue
        if (material.name === 'fh_paint') material.color.set(e.color)
        if (material.name === 'fh_glass') {
          // The source has opaque white windows. Simple tinted glass keeps the driver's view open.
          material.color.set('#40566b')
          material.transparent = true
          material.opacity = 0.28
          material.depthWrite = false
          material.side = THREE.FrontSide
          object.castShadow = false
        }
      }
    })

    return {}
  },
  paint(model, color) {
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material])
        if (material instanceof THREE.MeshStandardMaterial && material.name === 'fh_paint')
          material.color.set(color)
    })
  },
}
export const policePresentation: VehiclePresentationAdapter = {
  mount(model) {
    return { beacons: new PoliceEquipment(model) }
  },
}
const stock = new Map<string, VehiclePresentationAdapter>([
  [
    'nabla.truck',
    {
      mount(model, entity, definition, policy) {
        const mounts = definition ? authoredScreenMounts(model, definition.cluster) : undefined
        const instruments =
          mounts && definition ? new CarInstruments(mounts, definition) : undefined
        const tilt = entity.vehicle?.mirrorTilt ?? 0
        if (instruments) instruments.mirrorTilt = tilt
        const authored = authoredMirrorSurfaces(model)
        const lenses = authored.length
          ? authored
          : authoredMirrorLenses(model, entity.vehicle?.mirrors)
        model.updateWorldMatrix(true, true)
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(
          model.getWorldQuaternion(new THREE.Quaternion()),
        )
        paintWhiteBody(model, entity.color)
        return {
          instruments,
          mirrors: lenses.length
            ? new CarMirrors(
                lenses,
                up,
                tilt,
                policy,
                model.parent ?? model,
                entity.vehicle?.mirrorAim,
              )
            : undefined,
        }
      },
      paint(model, color) {
        paintWhiteBody(model, color)
      },
    },
  ],
  ['nabla.s3', s3Presentation],
  ['nabla.wrangler', wranglerPresentation],
  ['nabla.police', policePresentation],
])
export const stockVehiclePresentation: VehiclePresentationResolver = (entity) => {
  const id = entity.visual?.presentation
  if (!id) return undefined
  const adapter = stock.get(id)
  if (!adapter) console.warn(`Unknown vehicle presentation: ${id}`)
  return adapter
}
