import { afterEach, describe, expect, it, vi } from 'vitest'
import { localToGeo } from '../../src/math/geo/sphere.js'
import {
  footprintsOverlap,
  headingRotation,
  hostFootprint,
  headingYaw,
  hostVehicleLocalPose,
  hostVehiclesFromSearch,
  installHostVehicles,
  parseHostVehicles,
  type HostVehicle,
} from '../../game/host-vehicles.js'
import type { Entity } from '../../src/entity/schema.js'

/** `placeVehicle` receives the vehicle, or the vehicle followed by the entities it hosts. */
const vehicleOf = (template: Entity | Entity[]): Entity =>
  Array.isArray(template) ? template[0]! : template

const irun = { latitude: 43.3372, longitude: -1.7523, altitude: 50 }

describe('parseHostVehicles', () => {
  it('reads a JSON list with lat, lon, heading, vehicle and optional alt', () => {
    expect(
      parseHostVehicles(
        JSON.stringify([
          { lat: 43.3386, lon: -1.7899, heading: 118, vehicle: 'white-truck', color: '#2157a5' },
          { lat: 43.339, lon: -1.79, heading: 0, alt: 12, vehicle: 'white-trailer', tow: true },
        ]),
      ),
    ).toEqual<HostVehicle[]>([
      { lat: 43.3386, lon: -1.7899, heading: 118, vehicle: 'white-truck', color: '#2157a5' },
      { lat: 43.339, lon: -1.79, heading: 0, alt: 12, vehicle: 'white-trailer', tow: true },
    ])
  })

  it('defaults heading to 0 and accepts numeric strings', () => {
    expect(parseHostVehicles('[{"lat":"43.3","lon":"-1.8","vehicle":"a3"}]')).toEqual([
      { lat: 43.3, lon: -1.8, heading: 0, vehicle: 'a3' },
    ])
  })

  it('accepts box:false on a trailer and a catalog box id', () => {
    expect(
      parseHostVehicles(
        JSON.stringify([
          { lat: 43.3386, lon: -1.7899, heading: 0, vehicle: 'white-trailer-chassis' },
          {
            lat: 43.339,
            lon: -1.79,
            heading: 0,
            vehicle: 'white-trailer-chassis',
            box: 'white-box',
          },
          { lat: 43.34, lon: -1.791, heading: 0, vehicle: 'white-trailer', box: false },
        ]),
      ),
    ).toEqual([
      { lat: 43.3386, lon: -1.7899, heading: 0, vehicle: 'white-trailer-chassis' },
      {
        lat: 43.339,
        lon: -1.79,
        heading: 0,
        vehicle: 'white-trailer-chassis',
        box: 'white-box',
      },
      { lat: 43.34, lon: -1.791, heading: 0, vehicle: 'white-trailer', box: false },
    ])
  })

  it('rejects invalid JSON, a non-array, a missing preset, and out-of-range coordinates', () => {
    expect(() => parseHostVehicles('{')).toThrow(/JSON array/)
    expect(() => parseHostVehicles('{"lat":1}')).toThrow(/JSON array/)
    expect(() => parseHostVehicles('[{"lat":43,"lon":-1}]')).toThrow(/preset id/)
    expect(() => parseHostVehicles('[{"lat":95,"lon":0,"vehicle":"car"}]')).toThrow(/out of range/)
    expect(() => parseHostVehicles('[{"lat":43,"lon":200,"vehicle":"car"}]')).toThrow(
      /out of range/,
    )
    expect(() => parseHostVehicles('[{"lat":"x","lon":0,"vehicle":"car"}]')).toThrow(
      /finite number/,
    )
    expect(() => parseHostVehicles('[{"lat":43,"lon":-1,"vehicle":"car","color":"blue"}]')).toThrow(
      /#rrggbb/,
    )
    expect(() =>
      parseHostVehicles('[{"lat":43,"lon":-1,"vehicle":"white-trailer","box":"tanker"}]'),
    ).toThrow(/trailer box/)
  })
})

describe('hostVehiclesFromSearch', () => {
  const fallback: HostVehicle[] = [{ lat: 1, lon: 2, heading: 0, vehicle: 'car' }]

  it('uses the fallback when the param is absent, and an empty list when it is blank', () => {
    expect(hostVehiclesFromSearch('', fallback)).toEqual(fallback)
    expect(hostVehiclesFromSearch('?lat=43', fallback)).toEqual(fallback)
    expect(hostVehiclesFromSearch('?vehicles=', fallback)).toEqual([])
    expect(hostVehiclesFromSearch('?vehicles=%20', fallback)).toEqual([])
  })

  it('decodes a URL-encoded JSON array', () => {
    const list = [{ lat: 43.3386, lon: -1.7899, heading: 90, vehicle: 'white-truck' }]
    expect(
      hostVehiclesFromSearch('?vehicles=' + encodeURIComponent(JSON.stringify(list)), fallback),
    ).toEqual(list)
  })
})

describe('hostVehicleLocalPose', () => {
  it('maps WGS84 points onto the scene metre frame (+X east, −Z north)', () => {
    const east = localToGeo(irun, [100, 0, 0])
    const south = localToGeo(irun, [0, 0, 80])
    const placedEast = hostVehicleLocalPose(irun, {
      lat: east.latitude,
      lon: east.longitude,
      heading: 90,
      vehicle: 'car',
    })
    expect(placedEast.position[0]).toBeCloseTo(100, 6)
    expect(placedEast.position[2]).toBeCloseTo(0, 6)
    expect(placedEast.yaw).toBeCloseTo(-Math.PI / 2, 6)
    const placedSouth = hostVehicleLocalPose(irun, {
      lat: south.latitude,
      lon: south.longitude,
      heading: 180,
      vehicle: 'white-truck',
    })
    expect(placedSouth.position[0]).toBeCloseTo(0, 6)
    expect(placedSouth.position[2]).toBeCloseTo(80, 6)
    expect(placedSouth.yaw).toBeCloseTo(-Math.PI, 6)
  })

  it('uses optional alt as orthometric height in the ECEF conversion', () => {
    const pose = hostVehicleLocalPose(irun, {
      lat: irun.latitude,
      lon: irun.longitude,
      heading: 0,
      alt: 60,
      vehicle: 'car',
    })
    expect(pose.position[0]).toBeCloseTo(0, 6)
    expect(pose.position[1]).toBeCloseTo(10, 5)
    expect(pose.position[2]).toBeCloseTo(0, 6)
  })

  it('faces north at heading 0, matching the parked-fleet quaternion', () => {
    expect(headingYaw(0)).toBe(0)
    expect(headingRotation(118)).toEqual([
      0,
      Math.sin(headingYaw(118) / 2),
      0,
      Math.cos(headingYaw(118) / 2),
    ])
  })
})

describe('installHostVehicles', () => {
  it('converts each geographic entry and calls placeVehicle with the local pose', async () => {
    const east = localToGeo(irun, [40, 0, 0])
    const calls: { id: string; position: number[]; yaw: number }[] = []
    const ids = await installHostVehicles(
      {
        async placeVehicle(arg, position, yaw = 0) {
          const template = vehicleOf(arg)
          calls.push({ id: template.id, position: [...position], yaw })
          return `spawned-${calls.length}`
        },
      },
      irun,
      [
        { lat: east.latitude, lon: east.longitude, heading: 90, vehicle: 'car' },
        {
          lat: irun.latitude,
          lon: irun.longitude,
          heading: 0,
          vehicle: 'white-truck',
          color: '#b91929',
        },
      ],
    )
    expect(ids).toEqual(['spawned-1', 'spawned-2'])
    expect(calls[0]!.id).toBe('host-car-0')
    expect(calls[0]!.position[0]).toBeCloseTo(40, 6)
    expect(calls[0]!.position[2]).toBeCloseTo(0, 6)
    expect(calls[0]!.yaw).toBeCloseTo(-Math.PI / 2, 6)
    expect(calls[1]!.id).toBe('host-white-truck-1')
    expect(calls[1]!.position[0]).toBeCloseTo(0, 6)
    expect(calls[1]!.yaw).toBeCloseTo(0, 6)
  })

  it('places the carrier with its stern portal so the portal monitor has a mouth', async () => {
    const calls: Entity[][] = []
    await installHostVehicles(
      {
        async placeVehicle(arg) {
          calls.push(Array.isArray(arg) ? arg : [arg])
          return `spawned-${calls.length}`
        },
      },
      irun,
      [
        { lat: irun.latitude, lon: irun.longitude, heading: 60, vehicle: 'carrier' },
        { lat: 43.34, lon: -1.75, heading: 0, vehicle: 'car' },
      ],
    )
    expect(calls[0]!.map((e) => e.id)).toEqual(['host-carrier-0', 'host-carrier-0-stern'])
    expect(calls[0]![1]).toMatchObject({
      parentId: 'host-carrier-0',
      portal: { pairId: null, mode: 'closed', clearsRamp: true },
    })
    // Presets without hosted parts still pass a single entity.
    expect(calls[1]!.map((e) => e.id)).toEqual(['host-car-1'])
  })

  it('rejects an unknown preset before placing anything', async () => {
    const calls: string[] = []
    await expect(
      installHostVehicles(
        {
          async placeVehicle(arg) {
            const template = vehicleOf(arg)
            calls.push(template.id)
            return 'spawned-1'
          },
        },
        irun,
        [{ lat: 43.3, lon: -1.8, heading: 0, vehicle: 'not-a-preset' }],
      ),
    ).rejects.toThrow(/Unknown vehicle preset/)
    expect(calls).toEqual([])
  })

  it('applies spawn color and hitches a trailer to the previous tractor', async () => {
    const calls: { id: string; color: string; tow?: string }[] = []
    const ids = await installHostVehicles(
      {
        async placeVehicle(arg) {
          const template = vehicleOf(arg)
          calls.push({
            id: template.id,
            color: template.color,
            tow: template.vehicle?.tow?.vehicleId,
          })
          return `spawned-${calls.length}`
        },
      },
      irun,
      [
        { lat: 43.3386, lon: -1.7899, heading: 90, vehicle: 'white-truck', color: '#2157a5' },
        {
          lat: 43.3386,
          lon: -1.7899,
          heading: 90,
          vehicle: 'white-trailer',
          color: '#b91929',
          tow: true,
        },
        { lat: 43.339, lon: -1.79, heading: 0, vehicle: 'white-trailer', color: '#f0f0ea' },
      ],
    )
    expect(ids).toEqual(['spawned-1', 'spawned-2', 'spawned-3'])
    expect(calls[0]).toMatchObject({ color: '#2157a5' })
    expect(calls[1]).toMatchObject({ color: '#b91929', tow: 'spawned-1' })
    expect(calls[2]).toMatchObject({ color: '#f0f0ea', tow: undefined })
  })

  it('composes or strips the cargo box when placing trailers', async () => {
    const calls: { attachments?: string[]; height: number }[] = []
    await installHostVehicles(
      {
        async placeVehicle(arg) {
          const template = vehicleOf(arg)
          calls.push({
            attachments: template.visual?.attachments?.map((part) => part.url),
            height: template.size[1],
          })
          return `spawned-${calls.length}`
        },
      },
      irun,
      [
        { lat: 43.3386, lon: -1.7899, heading: 90, vehicle: 'white-trailer-chassis' },
        {
          lat: 43.3386,
          lon: -1.7899,
          heading: 90,
          vehicle: 'white-trailer-chassis',
          box: 'white-box',
        },
        { lat: 43.339, lon: -1.79, heading: 0, vehicle: 'white-trailer', box: false },
      ],
    )
    expect(calls[0]!.attachments).toBeUndefined()
    expect(calls[0]!.height).toBeLessThan(calls[1]!.height)
    expect(calls[1]!.attachments?.[0]).toMatch(/trailer\.box\.glb$/)
    expect(calls[2]!.attachments).toBeUndefined()
  })
})

describe('host vehicle footprints', () => {
  const yaw = headingYaw(330)
  const right = [Math.cos(yaw), -Math.sin(yaw)]
  const forward = [-Math.sin(yaw), -Math.cos(yaw)]
  const trailer = [2.55, 4, 13.5]
  const at = (r: number, f: number): [number, number, number] => [
    right[0] * r + forward[0] * f,
    0,
    right[1] * r + forward[1] * f,
  ]
  afterEach(() => vi.restoreAllMocks())

  it('separates trailers parked side by side and flags trailers stacked along their heading', () => {
    const a = hostFootprint(at(0, 0), yaw, trailer)
    expect(footprintsOverlap(a, hostFootprint(at(4.2, 0), yaw, trailer))).toBe(false)
    expect(footprintsOverlap(a, hostFootprint(at(0, 16), yaw, trailer))).toBe(false)
    expect(footprintsOverlap(a, hostFootprint(at(0, 4.2), yaw, trailer))).toBe(true)
    // A lat/lon grid laid out for heading 60 turned to 330 lines trailers up nose to tail.
    const crossed = hostFootprint(at(0, 4.17), yaw, trailer)
    expect(footprintsOverlap(a, crossed)).toBe(true)
    expect(footprintsOverlap(a, hostFootprint(at(2, 0), yaw + Math.PI / 2, trailer))).toBe(true)
  })

  it('skips overlapping host vehicles instead of spawning them inside each other', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const geo = (r: number, f: number) => {
      const p = localToGeo(irun, at(r, f))
      return { lat: p.latitude, lon: p.longitude, heading: 330 }
    }
    const placed: { id: string; tow?: string }[] = []
    const ids = await installHostVehicles(
      {
        async placeVehicle(arg) {
          const template = vehicleOf(arg)
          placed.push({ id: template.id, tow: template.vehicle?.tow?.vehicleId })
          return `spawned-${placed.length}`
        },
      },
      irun,
      [
        // 0, 1: hitched rig ? the trailer shares the tractor's lat/lon and is not a clash.
        { ...geo(-12, 0), vehicle: 'white-truck' },
        { ...geo(-12, 0), vehicle: 'white-trailer', tow: true },
        // 2, 3: free trailers side by side.
        { ...geo(0, 0), vehicle: 'white-trailer' },
        { ...geo(4.2, 0), vehicle: 'white-trailer' },
        // 4: stacked 4.2 m ahead of 2 along the heading ? skipped.
        { ...geo(0, 4.2), vehicle: 'white-trailer' },
        // 5: tractor inside the first rig ? skipped, and so is its tow:true trailer 6.
        { ...geo(-12, 1), vehicle: 'white-truck' },
        { ...geo(-12, 1), vehicle: 'white-trailer', tow: true },
        // 7: free trailer behind trailer 3 in the next row.
        { ...geo(4.2, -16), vehicle: 'white-trailer' },
      ],
    )
    expect(ids).toEqual(['spawned-1', 'spawned-2', 'spawned-3', 'spawned-4', 'spawned-5'])
    expect(placed.map((p) => p.id)).toEqual([
      'host-white-truck-0',
      'host-white-trailer-1',
      'host-white-trailer-2',
      'host-white-trailer-3',
      'host-white-trailer-7',
    ])
    expect(placed[1]!.tow).toBe('spawned-1')
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      'Host vehicle 4 (white-trailer) skipped: it overlaps host vehicle 2',
      'Host vehicle 5 (white-truck) skipped: it overlaps host vehicle 0',
      'Host vehicle 6 (white-trailer) skipped: its tractor was skipped',
    ])
  })

  it('checks a hitched trailer where the tow joint puts it, behind the tractor', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const geo = (r: number, f: number) => {
      const p = localToGeo(irun, at(r, f))
      return { lat: p.latitude, lon: p.longitude, heading: 330 }
    }
    const ids = await installHostVehicles({ placeVehicle: async (t) => vehicleOf(t).id }, irun, [
      // Free trailer parked 12 m behind the tractor (clear of the cab): the towed trailer lands on it.
      { ...geo(0, -12), vehicle: 'white-trailer' },
      { ...geo(0, 0), vehicle: 'white-truck' },
      { ...geo(0, 0), vehicle: 'white-trailer', tow: true },
    ])
    expect(ids).toEqual(['host-white-trailer-0', 'host-white-truck-1'])
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/Host vehicle 2 .* overlaps host vehicle 0/)
  })
})
