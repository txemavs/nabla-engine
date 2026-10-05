import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  hasTrailerBox,
  trailerBox,
  trailerBoxes,
} from '../../src/catalog/vehicles/trailer-boxes.js'
import { presetVehicle, vehiclePreset } from '../../src/catalog/vehicles/library.js'

const BOX_MESH = /^(box01|Box_)/i
const STUETZBEIN = /stuetzbein/i
const CHASSIS = 'assets/library/trucks/white-truck/assets/trailer.chassis.glb'
const BOX = 'assets/library/trucks/white-truck/assets/trailer.box.glb'

function readGlbJson(path: string): {
  nodes: { name?: string; mesh?: number; extras?: { nabla?: { anchor?: string } } }[]
  materials?: { name?: string }[]
} {
  const bytes = fs.readFileSync(path)
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as ReturnType<
    typeof readGlbJson
  >
}

function meshNames(path: string): string[] {
  return readGlbJson(path)
    .nodes.filter((node) => node.mesh !== undefined)
    .map((node) => node.name ?? '')
}

describe('trailer chassis + box assets', () => {
  it('keeps landing gear and the kingpin on the chassis GLB', () => {
    const names = meshNames(CHASSIS)
    expect(names.some((name) => STUETZBEIN.test(name))).toBe(true)
    expect(names.some((name) => BOX_MESH.test(name))).toBe(false)
    expect(
      readGlbJson(CHASSIS).nodes.some((node) => node.extras?.nabla?.anchor === 'tow.anchor'),
    ).toBe(true)
  })

  it('puts the white cargo body on the box GLB only', () => {
    const names = meshNames(BOX)
    expect(names.some((name) => BOX_MESH.test(name))).toBe(true)
    expect(names.some((name) => STUETZBEIN.test(name))).toBe(false)
    expect(
      readGlbJson(BOX).materials?.some((material) => /^White paint/i.test(material.name ?? '')),
    ).toBe(true)
  })
})

describe('trailer composition at spawn', () => {
  it('lists the stock white box and composes it onto white-trailer', () => {
    expect(trailerBoxes().map((box) => box.id)).toEqual(['white-box'])
    expect(hasTrailerBox('white-box')).toBe(true)
    const trailer = presetVehicle('white-trailer', 'full')
    expect(trailer.visual?.body.url).toMatch(/trailer\.chassis\.glb$/)
    expect(trailer.visual?.attachments).toEqual([
      {
        url: trailerBox('white-box').url,
        transform: trailerBox('white-box').transform,
      },
    ])
    expect(trailer.vehicle?.towAnchor).toEqual(
      vehiclePreset('white-trailer-chassis').vehicle.towAnchor,
    )
    expect(trailer.vehicle?.passive).toBe(true)
  })

  it('spawns a bare chassis from the chassis preset or box:false', () => {
    const chassis = presetVehicle('white-trailer-chassis', 'bare')
    expect(chassis.visual?.attachments).toBeUndefined()
    expect(chassis.visual?.body.url).toMatch(/trailer\.chassis\.glb$/)
    expect(chassis.size[1]).toBeLessThan(presetVehicle('white-trailer', 'full').size[1])
    const stripped = presetVehicle('white-trailer', 'stripped', undefined, { box: false })
    expect(stripped.visual?.attachments).toBeUndefined()
    expect(stripped.mass).toBe(chassis.mass)
    expect(stripped.vehicle?.colliders).toEqual(chassis.vehicle?.colliders)
  })

  it('attaches a catalog box onto a chassis', () => {
    const composed = presetVehicle('white-trailer-chassis', 'with-box', undefined, {
      box: 'white-box',
    })
    expect(composed.visual?.attachments?.[0]?.url).toBe(trailerBox('white-box').url)
    expect(composed.size).toEqual(presetVehicle('white-trailer', 'full').size)
    expect(composed.mass).toBe(4000 + trailerBox('white-box').mass)
    expect(() => presetVehicle('white-truck', 'truck', undefined, { box: 'white-box' })).toThrow(
      /trailer chassis/,
    )
    expect(() =>
      presetVehicle('white-trailer-chassis', 'bad', undefined, { box: 'tanker' }),
    ).toThrow(/trailer box/)
  })
})
