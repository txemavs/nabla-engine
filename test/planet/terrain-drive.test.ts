import { describe, expect, it } from 'vitest'
import {
  createTerrainDriveScene,
  parseTileSpec,
  tileOffsetToGeo,
} from '../../src/examples/terrain-drive.js'
import { parseScene } from '../../src/scene/document.js'
import { mapTileAt } from '../../src/scene/mercator.js'

describe('terrain drive example', () => {
  it('parses tiles and rejects malformed ones', () => {
    expect(parseTileSpec('16211/12003')).toEqual({ z: 15, x: 16211, y: 12003 })
    expect(parseTileSpec(' 16212,12003 ')).toEqual({ z: 15, x: 16212, y: 12003 })
    for (const bad of ['', '16211', 'a/b', '16211/12003/1', '99999/1', '-1/2'])
      expect(() => parseTileSpec(bad)).toThrow()
  })

  it('places offsets east/south of the tile centre on the same tile', () => {
    const tile = parseTileSpec('16211/12003')
    const centre = tileOffsetToGeo(tile)
    expect(centre.latitude).toBeCloseTo(43.29719840464635, 9)
    expect(centre.longitude).toBeCloseTo(-1.8951416015625, 9)
    const moved = tileOffsetToGeo(tile, 100, 200)
    expect(moved.longitude).toBeGreaterThan(centre.longitude)
    expect(moved.latitude).toBeLessThan(centre.latitude)
    expect((centre.latitude - moved.latitude) * 111_195).toBeCloseTo(200, 0)
    expect(mapTileAt(moved.latitude, moved.longitude, 15)).toEqual(tile)
  })

  it('builds a valid scene: player vehicle, parked fleet and a hitched trailer', () => {
    const scene = parseScene(
      createTerrainDriveScene({ latitude: 43.2954, longitude: -1.8949, heading: 118 }),
    )
    expect(scene.geography).toMatchObject({ altitude: 0, imagery: 'offline', planetary: true })
    expect(scene.sky).toEqual({ mode: 'fixed', at: '2026-06-21T10:30:00.000Z' })
    const vehicles = scene.entities.filter((e) => e.vehicle)
    expect(vehicles.map((v) => v.id).sort()).toEqual([
      'demo-a3',
      'demo-carrier',
      'demo-white-truck',
      'demo-white-truck-trailer',
      'player-vehicle',
    ])
    const player = vehicles.find((v) => v.id === 'player-vehicle')!
    expect(player.transform.position).toEqual([0, 0, 0])
    const truck = vehicles.find((v) => v.id === 'demo-white-truck')!
    const trailer = vehicles.find((v) => v.id === 'demo-white-truck-trailer')!
    expect(trailer.vehicle!.tow).toMatchObject({ vehicleId: truck.id })
    expect(scene.entities.some((e) => e.kind === 'spawn')).toBe(true)
    // Everyone is authored at height 0 and ground-rested at play time.
    expect(
      scene.entities.filter((e) => !e.parentId).every((e) => e.transform.position[1] === 0),
    ).toBe(true)
  })

  it('lines the fleet up along the heading (118° = east-south-east, -Z is north)', () => {
    const scene = createTerrainDriveScene({ latitude: 0, longitude: 0, heading: 90 })
    const truck = scene.entities.find((e) => e.id === 'demo-white-truck')!
    const trailer = scene.entities.find((e) => e.id === 'demo-white-truck-trailer')!
    expect(truck.transform.position[0]).toBeCloseTo(26, 6) // east
    expect(truck.transform.position[2]).toBeCloseTo(0, 6)
    expect(trailer.transform.position[0]).toBeCloseTo(26 - 7.33, 6) // behind the truck
    const [, y, , w] = truck.transform.rotation
    expect(2 * Math.atan2(y, w)).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('swaps the player vehicle without duplicating it', () => {
    const scene = createTerrainDriveScene({ latitude: 0, longitude: 0, vehicle: 'white-truck' })
    const ids = scene.entities.filter((e) => e.vehicle).map((e) => e.id)
    expect(ids).toContain('player-vehicle')
    expect(ids).not.toContain('demo-white-truck')
    expect(ids).toContain('player-vehicle-trailer')
    expect(ids).toContain('demo-car')
    parseScene(scene)
  })

  it('selects the sun', () => {
    expect(createTerrainDriveScene({ latitude: 0, longitude: 0, sky: 'live' }).sky).toEqual({
      mode: 'live',
    })
    expect(
      createTerrainDriveScene({ latitude: 0, longitude: 0, sky: '2026-12-21T08:00:00+01:00' }).sky,
    ).toEqual({ mode: 'fixed', at: '2026-12-21T07:00:00.000Z' })
    expect(() => createTerrainDriveScene({ latitude: 0, longitude: 0, sky: 'noon' })).toThrow(
      /Invalid sky/,
    )
  })
})
