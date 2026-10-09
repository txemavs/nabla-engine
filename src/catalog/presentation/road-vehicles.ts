import * as THREE from 'three'
import { vehicleAppearanceDefaults } from '../../config/vehicle-appearance.js'
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
function paintWhiteBody(model: THREE.Object3D, color: string): void {
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      if (material instanceof THREE.MeshStandardMaterial && /^White paint/i.test(material.name))
        material.color.set(color)
  })
}

function shineVehicle(model: THREE.Object3D): void {
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      if (/^llanta/i.test(material.name) && material.metalness > 0.5) {
        material.metalness = vehicleAppearanceDefaults.wheels.metalness
        material.needsUpdate = true
      }
      if (!/^cromo/i.test(material.name)) continue
      material.metalness = vehicleAppearanceDefaults.chrome.metalness
      material.roughness = Math.min(
        material.roughness,
        vehicleAppearanceDefaults.chrome.maxRoughness,
      )
      material.needsUpdate = true
    }
  })
}

export const s3Presentation: VehiclePresentationAdapter = {
  mount(model, e, definition, policy) {
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
          ...vehicleAppearanceDefaults.paint,
          ...(e.vehicle?.paintFinish === 'chrome' ? vehicleAppearanceDefaults.chromePaint : {}),
        })
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
  preparePart(model) {
    shineVehicle(model)
  },
  paint(model, color, finish = 'paint') {
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material])
        if (material instanceof THREE.MeshStandardMaterial && /^Pintura/.test(material.name)) {
          material.color.set(color)
          Object.assign(
            material,
            finish === 'chrome'
              ? vehicleAppearanceDefaults.chromePaint
              : vehicleAppearanceDefaults.paint,
          )
        }
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
const motorcyclePresentation: VehiclePresentationAdapter = {
  mount(model, entity) {
    this.paint?.(model, entity.color)
    return {}
  },
  paint(model, color) {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of [object.material].flat())
        if (material instanceof THREE.MeshStandardMaterial && material.userData.nabla?.paint)
          material.color.set(color)
    })
  },
}
export const stockVehiclePresentation: VehiclePresentationResolver = (entity) => {
  const id = entity.visual?.presentation
  if (!id) return entity.vehicle?.twoWheeled ? motorcyclePresentation : undefined
  const adapter = stock.get(id)
  if (!adapter) console.warn(`Unknown vehicle presentation: ${id}`)
  return adapter
}
