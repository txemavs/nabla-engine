/**
 * Left and right side mirrors behave as a mirrored pair. The same «Espejos» slider value turns each
 * glass outward / up by the same amount, and the S3's baked aim puts the right view where the
 * left view is, mirrored across the car. Without that aim the right glass, mirror-symmetric to the
 * left but far from a left-hand driver at eye height, looked about 20° further outward and a little
 * up (mostly sky, slanted horizon: Txema 2026-10-09 «el espejo derecho se inclina mal»).
 */
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  authoredMirrorSurfaces,
  CarMirrors,
  type MirrorAngle,
} from '../../src/render/entity/car-mirrors.js'

/** Load a GLB; textures are dropped (Node has no image decoder) — only geometry matters here. */
async function load(file: string): Promise<Group> {
  const source = await fs.readFile(file)
  const length = source.readUInt32LE(12)
  const json = JSON.parse(source.subarray(20, 20 + length).toString())
  delete json.images
  delete json.textures
  delete json.samplers
  for (const material of json.materials ?? []) {
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete material[key]
    const pbr = material.pbrMetallicRoughness ?? {}
    delete pbr.baseColorTexture
    delete pbr.metallicRoughnessTexture
    delete material.extensions
  }
  const text = Buffer.from(JSON.stringify(json))
  const padded = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 32)])
  const rest = source.subarray(20 + length)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + padded.length + rest.length, 8)
  header.writeUInt32LE(padded.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const bytes = Buffer.concat([header, padded, rest])
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  return gltf.scene
}

/** Driver's reflected view off each live glass, by side, in the vehicle frame (+X right). */
function views(root: Object3D, mirrors: CarMirrors, eyes: Vector3): Record<string, Vector3> {
  root.updateMatrixWorld(true)
  const entries = (mirrors as unknown as { entries: { side: string; mirror: Object3D }[] }).entries
  return Object.fromEntries(
    entries.map(({ side, mirror }) => {
      const centre = mirror.getWorldPosition(new Vector3())
      const normal = new Vector3(0, 0, 1).transformDirection(mirror.matrixWorld)
      const d = centre.sub(eyes).normalize()
      return [side, d.addScaledVector(normal, -2 * d.dot(normal))]
    }),
  )
}

const degrees = (a: Vector3, b: Vector3) => (a.angleTo(b) * 180) / Math.PI
/** Outward angle of a view from straight back (+Z behind, +X right), degrees. */
const outward = (side: string, v: Vector3) =>
  (Math.atan2(side === 'left' ? -v.x : v.x, v.z) * 180) / Math.PI
const elevation = (v: Vector3) => (Math.asin(v.y) * 180) / Math.PI

function eyesOf(root: Object3D): Vector3 {
  let eyes: Vector3 | undefined
  root.updateMatrixWorld(true)
  root.traverse((node) => {
    if (node.userData.nabla?.anchor === 'driver.eyes') eyes = node.getWorldPosition(new Vector3())
  })
  if (!eyes) throw new Error('no driver.eyes anchor')
  return eyes
}

async function s3() {
  const model = await load('assets/library/cars/a3/a3.cabrio.glb')
  // The preset turns the body 180° about Y into chassis space (forward −Z, +X right).
  model.quaternion.set(0, 1, 0, 0)
  const chassis = new Group().add(model)
  const lenses: Mesh[] = []
  model.traverse((node) => {
    if (node instanceof Mesh && (node.material as MeshStandardMaterial).name === 'Llanta 2')
      lenses.push(node)
  })
  const preset = JSON.parse(readFileSync('assets/library/cars/a3/s3.json', 'utf8')) as {
    vehicle: { mirrorTilt?: number; mirrorAim?: Record<string, MirrorAngle> }
  }
  return { root: chassis, lenses, eyes: eyesOf(chassis), preset: preset.vehicle }
}

async function truck() {
  const scene = await load('assets/library/trucks/white-truck/assets/tractor.modern.glb')
  return { root: scene, lenses: authoredMirrorSurfaces(scene), eyes: eyesOf(scene), preset: {} }
}

/** How far one slider step moves each side's view: outward and up, degrees. */
function sliderResponse(root: Object3D, mirrors: CarMirrors, eyes: Vector3) {
  mirrors.setAdjustment({})
  const base = views(root, mirrors, eyes)
  mirrors.setAdjustment({ left: { yaw: 5 }, right: { yaw: 5 } })
  const yawed = views(root, mirrors, eyes)
  mirrors.setAdjustment({ left: { tilt: 4 }, right: { tilt: 4 } })
  const tilted = views(root, mirrors, eyes)
  mirrors.setAdjustment({})
  return Object.fromEntries(
    Object.keys(base).map((side) => [
      side,
      {
        out: outward(side, yawed[side]) - outward(side, base[side]),
        up: elevation(tilted[side]) - elevation(base[side]),
      },
    ]),
  )
}

describe('side mirror symmetry', () => {
  for (const [name, build] of [
    ['S3', s3],
    ['truck', truck],
  ] as const)
    it(`${name}: the same slider value turns left and right glass alike`, async () => {
      const { root, lenses, eyes, preset } = await build()
      // As driven: the preset's tilt and baked aim, with the sliders on top.
      const p = preset as { mirrorTilt?: number; mirrorAim?: Record<string, MirrorAngle> }
      const mirrors = new CarMirrors(
        lenses,
        new Vector3(0, 1, 0),
        p.mirrorTilt ?? 0,
        {},
        root,
        p.mirrorAim,
      )
      expect(mirrors.sides.sort()).toEqual(['left', 'right'])
      const response = sliderResponse(root, mirrors, eyes)
      mirrors.dispose()
      for (const side of ['left', 'right']) {
        // +5° yaw swings the view outward by about twice that; +4° tilt raises it.
        expect(response[side].out).toBeGreaterThan(7)
        expect(response[side].out).toBeLessThan(12)
        expect(response[side].up).toBeGreaterThan(3)
        expect(response[side].up).toBeLessThan(10)
      }
      expect(Math.abs(response.left.out - response.right.out)).toBeLessThan(1.5)
      expect(Math.abs(response.left.up - response.right.up)).toBeLessThan(1.5)
    })

  it('S3: with its baked aim the right view mirrors the left view across the car', async () => {
    const { root, lenses, eyes, preset } = await s3()
    const tilt = preset.mirrorTilt ?? -2
    const authored = new CarMirrors(lenses, new Vector3(0, 1, 0), tilt, {}, root)
    const before = views(root, authored, eyes)
    authored.dispose()
    // The glass alone (no aim): the right view sits far outward of the left's mirror image.
    expect(outward('right', before.right) - outward('left', before.left)).toBeGreaterThan(12)

    const aimed = new CarMirrors(lenses, new Vector3(0, 1, 0), tilt, {}, root, preset.mirrorAim)
    const after = views(root, aimed, eyes)
    aimed.dispose()
    const mirroredLeft = after.left.clone().setX(-after.left.x)
    expect(degrees(after.right, mirroredLeft)).toBeLessThan(1.5)
    // Still a rear view that shows the road beside the car: outward, near level.
    expect(outward('right', after.right)).toBeGreaterThan(8)
    expect(Math.abs(elevation(after.right))).toBeLessThan(3)
    // The left glass keeps its authored aim.
    expect(degrees(after.left, before.left)).toBeLessThan(1e-3)
  })
})
