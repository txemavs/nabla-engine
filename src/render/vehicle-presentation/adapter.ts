import type { Group, Texture, Object3D } from 'three'
import type { ExhaustSmokeOptions } from '../entity/exhaust-smoke.js'
import type { Entity } from '../../entity/schema.js'
import type { CarInstruments } from '../entity/car-instruments.js'
import type { CarInstrumentDefinition } from '../entity/car-instrument-definition.js'
import type { CarLights } from '../entity/car-lights.js'
import type { CarMirrors, MirrorPolicy } from '../entity/car-mirrors.js'
export interface BeaconEquipment {
  readonly textures: readonly Texture[]
  update(now: number, active: boolean): void
}
export interface VehicleEquipment {
  lights?: CarLights
  mirrors?: CarMirrors
  instruments?: CarInstruments
  beacons?: BeaconEquipment
  exhaust?: { outlet: Object3D; options?: ExhaustSmokeOptions }
}
export interface VehiclePresentationAdapter {
  mount(
    model: Group,
    entity: Entity,
    instruments?: CarInstrumentDefinition | null,
    mirrorPolicy?: MirrorPolicy,
  ): VehicleEquipment
  preparePart?(model: Group, kind: 'body' | 'wheel' | 'steering'): void
  paint?(model: Group, color: string, finish?: 'paint' | 'chrome'): void
}
export type VehiclePresentationResolver = (entity: Entity) => VehiclePresentationAdapter | undefined
