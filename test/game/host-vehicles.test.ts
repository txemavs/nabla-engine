import { describe, expect, it } from 'vitest'
import { localToGeo } from '../../src/math/geo/sphere.js'
import {
  headingRotation,
  headingYaw,
  hostVehicleLocalPose,
  hostVehiclesFromSearch,
  installHostVehicles,
  parseHostVehicles,
  type HostVehicle,
} from '../../game/host-vehicles.js'

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
        async placeVehicle(template, position, yaw = 0) {
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

  it('rejects an unknown preset before placing anything', async () => {
    const calls: string[] = []
    await expect(
      installHostVehicles(
        {
          async placeVehicle(template) {
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
        async placeVehicle(template) {
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
})
