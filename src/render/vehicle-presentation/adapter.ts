import type { Group, Texture } from 'three'
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
}
export interface VehiclePresentationAdapter {
  mount(
    model: Group,
    entity: Entity,
    instruments?: CarInstrumentDefinition | null,
    mirrorPolicy?: MirrorPolicy,
  ): VehicleEquipment
  preparePart?(model: Group, kind: 'body' | 'wheel' | 'steering'): void
  paint?(model: Group, color: string): void
}
export type VehiclePresentationResolver = (entity: Entity) => VehiclePresentationAdapter | undefined
