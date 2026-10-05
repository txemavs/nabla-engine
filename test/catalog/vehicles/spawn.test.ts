import { describe, expect, it } from 'vitest'
import { hasVehiclePreset, presetVehicle } from '../../../src/catalog/vehicles/library.js'
import {
  WHITE_TRAILER_PLACEMENT_OFFSET,
  WHITE_TRUCK_TRAILER_CHOICE,
  WHITE_TRUCK_TRAILER_LABEL,
  hasSpawnChoice,
  hitchTrailer,
  spawnChoiceEntities,
  spawnChoicePlayerPreset,
  vehicleSpawnChoices,
} from '../../../src/catalog/vehicles/spawn.js'
import { parseScene } from '../../../src/scene/document.js'
import { createEntity } from '../../../src/entity/schema.js'

/** Hitch / kingpin used by `test/simulation/trailer.test.ts`. */
const TEST_HITCH = [0, 0, 1.766745487] as const
const TEST_ANCHOR = [0, 0, -5.565219856] as const

describe('trailer spawn choices', () => {
  it('keeps the combo out of the catalog so hasVehiclePreset / presetVehicle stay honest', () => {
    expect(hasVehiclePreset(WHITE_TRUCK_TRAILER_CHOICE)).toBe(false)
    expect(() => presetVehicle(WHITE_TRUCK_TRAILER_CHOICE, 'x')).toThrow(/No vehicle preset/)
    expect(hasVehiclePreset('white-trailer')).toBe(true)
    expect(hasSpawnChoice(WHITE_TRUCK_TRAILER_CHOICE)).toBe(true)
    expect(hasSpawnChoice('white-trailer')).toBe(true)
    expect(hasSpawnChoice('not-a-preset')).toBe(false)
  })

  it('lists the free trailer and the coupled combo after the white truck', () => {
    const ids = vehicleSpawnChoices().map((choice) => choice.id)
    expect(ids).toEqual(expect.arrayContaining(['car', 'white-truck', 'white-trailer', 'carrier']))
    expect(ids.indexOf(WHITE_TRUCK_TRAILER_CHOICE)).toBe(ids.indexOf('white-truck') + 1)
    expect(
      vehicleSpawnChoices().find((choice) => choice.id === WHITE_TRUCK_TRAILER_CHOICE)?.label,
    ).toBe(WHITE_TRUCK_TRAILER_LABEL)
    expect(vehicleSpawnChoices().find((choice) => choice.id === 'white-trailer')?.label).toBe(
      'Remolque blanco',
    )
  })

  it('builds a towed pair with the authored hitch geometry from the trailer test', () => {
    const tractor = presetVehicle('white-truck', 'tractor')
    const hitch = tractor.vehicle!.hitch!
    const trailer = presetVehicle('white-trailer', 'trailer')
    const anchor = trailer.vehicle!.towAnchor!
    expect(hitch[0]).toBeCloseTo(TEST_HITCH[0], 6)
    expect(hitch[1]).toBeCloseTo(TEST_HITCH[1], 6)
    expect(hitch[2]).toBeCloseTo(TEST_HITCH[2], 6)
    expect(anchor[0]).toBeCloseTo(TEST_ANCHOR[0], 6)
    expect(anchor[1]).toBeCloseTo(TEST_ANCHOR[1], 6)
    expect(anchor[2]).toBeCloseTo(TEST_ANCHOR[2], 6)

    const [truck, towed] = spawnChoiceEntities(WHITE_TRUCK_TRAILER_CHOICE, 'rig', [0, 1.45, 0])
    expect(truck.vehicle!.passive).toBeFalsy()
    expect(towed.vehicle!.passive).toBe(true)
    expect(towed.id).toBe('rig-trailer')
    expect(towed.transform.position[2]).toBeCloseTo(0 + WHITE_TRAILER_PLACEMENT_OFFSET, 6)
    expect(towed.vehicle!.tow).toEqual({
      vehicleId: truck.id,
      hitch: [hitch[0], hitch[1], hitch[2]],
      anchor: [anchor[0], anchor[1], anchor[2]],
    })
    parseScene({
      version: 1,
      name: 'Combo spawn',
      entities: [createEntity('spawn', 'spawn', [-3, 1, 0]), truck, towed],
    })
  })

  it('spawns the trailer alone without a tow joint', () => {
    const [trailer] = spawnChoiceEntities('white-trailer', 'free')
    expect(trailer.vehicle!.passive).toBe(true)
    expect(trailer.vehicle!.tow).toBeUndefined()
    expect(spawnChoicePlayerPreset('white-trailer')).toBeNull()
    expect(spawnChoicePlayerPreset(WHITE_TRUCK_TRAILER_CHOICE)).toBe('white-truck')
    expect(spawnChoicePlayerPreset('car')).toBe('car')
  })

  it('hitches with the tractor and trailer ids the caller already stamped', () => {
    const tractor = presetVehicle('white-truck', 'host-truck')
    const trailer = presetVehicle('white-trailer', 'host-trailer')
    hitchTrailer(tractor, trailer)
    expect(trailer.vehicle!.tow!.vehicleId).toBe('host-truck')
  })
})
