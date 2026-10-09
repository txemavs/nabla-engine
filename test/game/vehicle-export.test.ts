import { describe, expect, it } from 'vitest'
import { vehiclePresets } from '@nabla/engine/vehicles'
import { exportVehiclePlacements, vehiclePresetId } from '../../game/scene-controls.js'

const preset = (id: string) => vehiclePresets().find((p) => p.id === id)!
const at = (
  id: string,
  presetId: string,
  extra: Partial<Parameters<typeof vehiclePresetId>[0]> & Record<string, unknown> = {},
) => ({
  id,
  name: preset(presetId).name,
  visual: preset(presetId).visual.body.url,
  color: null,
  lat: 43.3422914321,
  lon: -1.7595111234,
  heading: 308.96,
  towedBy: null,
  player: false,
  ...extra,
})

describe('exportVehiclePlacements', () => {
  it('names catalog presets from the live body model', () => {
    expect(vehiclePresetId(at('a', 'vfr800'))).toBe('vfr800')
    expect(vehiclePresetId(at('b', 'car'))).toBe('car')
  })
  it('splits the occupied start vehicle and lists hitched trailers after their tractor', () => {
    const out = exportVehiclePlacements([
      at('player-vehicle', 'car', { player: true }),
      at('host-white-trailer-1', 'white-trailer', {
        towedBy: 'host-white-truck-0',
        color: '#2157a5',
      }),
      at('host-white-truck-0', 'white-truck', { color: '#2157a5', heading: 359.97 }),
      at('host-vfr800-2', 'vfr800'),
    ])
    expect(out.start).toEqual({
      id: 'player-vehicle',
      vehicle: 'car',
      lat: 43.342291,
      lon: -1.759511,
      heading: 309,
    })
    expect(out.vehicles.map((v) => [v.id, v.vehicle, v.tow ?? false])).toEqual([
      ['host-white-truck-0', 'white-truck', false],
      ['host-white-trailer-1', 'white-trailer', true],
      ['host-vfr800-2', 'vfr800', false],
    ])
    expect(out.vehicles[0].heading).toBe(0)
    expect(out.vehicles[0].color).toBe('#2157a5')
  })
})
