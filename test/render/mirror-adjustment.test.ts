import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  authoredMirrorSurfaces,
  CarMirrors,
  clampMirrorAdjustment,
  clampMirrorAngle,
  mirrorModelKey,
  mirrorSideOf,
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

/** Driver's reflected view direction off each live Reflector (the glass the player sees). */
function views(root: Object3D, lenses: Mesh[], eyes: Vector3): Record<string, Vector3> {
  root.updateMatrixWorld(true)
  return Object.fromEntries(
    lenses.map((lens) => {
      const glass = lens.parent!.children.find((node) => node !== lens)!
      const centre = glass.getWorldPosition(new Vector3())
      const normal = new Vector3(0, 0, 1).transformDirection(glass.matrixWorld)
      const d = centre.sub(eyes).normalize()
      return [lens.userData.nabla.mirror, d.addScaledVector(normal, -2 * d.dot(normal))]
    }),
  )
}

const degrees = (a: Vector3, b: Vector3) => (a.angleTo(b) * 180) / Math.PI

describe('mirror glass adjustment', () => {
  it('clamps and snaps each axis and drops neutral sides', () => {
    expect(clampMirrorAngle({ yaw: 40, tilt: -0.74 })).toEqual({ yaw: 25, tilt: -0.5 })
    expect(clampMirrorAngle({ yaw: Number.NaN })).toEqual({ yaw: 0, tilt: 0 })
    expect(clampMirrorAdjustment({ left: { yaw: -2.26 }, right: { yaw: 0.1, tilt: 0 } })).toEqual({
      left: { yaw: -2.5, tilt: 0 },
    })
  })

  it('keys S3 and A3 apart although they share a body GLB', () => {
    const body = '/library/cars/a3/a3.cabrio.glb'
    expect(mirrorModelKey(body, '/library/cars/a3/s3.steering.glb')).not.toBe(
      mirrorModelKey(body, '/library/cars/a3/a3.steering.glb'),
    )
    expect(mirrorModelKey('/truck.glb')).toBe('/truck.glb')
  })

  it('turns the truck glass outward / inward and up, and the reflected view follows', async () => {
    const scene = await load('assets/library/trucks/white-truck/assets/tractor.modern.glb')
    let eyes: Vector3 | undefined
    scene.updateMatrixWorld(true)
    scene.traverse((node) => {
      if (node.userData.nabla?.anchor === 'driver.eyes') eyes = node.getWorldPosition(new Vector3())
    })
    const lenses = authoredMirrorSurfaces(scene)
    const mirrors = new CarMirrors(lenses, new Vector3(0, 1, 0), 0, {}, scene)
    expect(mirrors.sides.sort()).toEqual(['left', 'right'])
    const authored = views(scene, lenses, eyes!)

    mirrors.setAdjustment({ left: { yaw: 5 }, right: { yaw: 5 } })
    const outward = views(scene, lenses, eyes!)
    // +X is the driver's right: outward moves the left view to −X and the right view to +X.
    expect(outward.left.x).toBeLessThan(authored.left.x - 0.1)
    expect(outward.right.x).toBeGreaterThan(authored.right.x + 0.1)
    // The view turns by about twice the glass angle.
    expect(degrees(outward.left, authored.left)).toBeGreaterThan(8)
    expect(degrees(outward.left, authored.left)).toBeLessThan(12)

    mirrors.setAdjustment({ left: { yaw: -5 }, right: { yaw: -5 } })
    const inward = views(scene, lenses, eyes!)
    expect(inward.left.x).toBeGreaterThan(authored.left.x + 0.1)
    expect(inward.right.x).toBeLessThan(authored.right.x - 0.1)

    mirrors.setAdjustment({ right: { tilt: 4 } })
    const raised = views(scene, lenses, eyes!)
    expect(raised.right.y).toBeGreaterThan(authored.right.y + 0.05)
    expect(degrees(raised.left, authored.left)).toBeLessThan(1e-3)

    mirrors.setAdjustment({})
    const back = views(scene, lenses, eyes!)
    mirrors.dispose()

    // A baked aim (`vehicle.mirrorAim`) is the same glass turn, and the sliders add to it.
    const baked = new CarMirrors(lenses, new Vector3(0, 1, 0), 0, {}, scene, {
      left: { yaw: 3, tilt: 0 },
    })
    const aimed = views(scene, lenses, eyes!)
    baked.setAdjustment({ left: { yaw: 2 } })
    const both = views(scene, lenses, eyes!)
    baked.dispose()
    const reference = new CarMirrors(lenses, new Vector3(0, 1, 0), 0, {}, scene)
    reference.setAdjustment({ left: { yaw: 3 } })
    expect(degrees(views(scene, lenses, eyes!).left, aimed.left)).toBeLessThan(1e-3)
    reference.setAdjustment({ left: { yaw: 5 } })
    expect(degrees(views(scene, lenses, eyes!).left, both.left)).toBeLessThan(1e-3)
    reference.dispose()
    for (const side of ['left', 'right'])
      expect(degrees(back[side], authored[side])).toBeLessThan(1e-3)
  })

  it('finds the S3 / A3 door lenses (no side tag) on their own door in chassis space', async () => {
    const model = await load('assets/library/cars/a3/a3.cabrio.glb')
    // The preset turns the body 180° about Y into chassis space (forward −Z, +X right).
    model.quaternion.set(0, 1, 0, 0)
    const chassis = new Group().add(model)
    const lenses: Mesh[] = []
    model.traverse((node) => {
      if (node instanceof Mesh && (node.material as MeshStandardMaterial).name === 'Llanta 2')
        lenses.push(node)
    })
    expect(lenses).toHaveLength(2)
    const sides = Object.fromEntries(
      lenses.map((lens) => {
        let door: Object3D | null = lens
        while (door && !/Puerta/.test(door.name)) door = door.parent
        return [
          /Izquierda/.test(door?.name ?? '') ? 'Izquierda' : 'Derecha',
          mirrorSideOf(lens, chassis),
        ]
      }),
    )
    expect(sides).toEqual({ Izquierda: 'left', Derecha: 'right' })
  })

  it('tells untagged lenses their side from where they sit across the vehicle', () => {
    const root = new Group()
    const material = new MeshStandardMaterial()
    const left = new Mesh(undefined, material)
    left.position.set(-0.9, 1, -0.5)
    const right = new Mesh(undefined, material)
    right.position.set(0.9, 1, -0.5)
    root.add(left, right)
    expect(mirrorSideOf(left, root)).toBe('left')
    expect(mirrorSideOf(right, root)).toBe('right')
    expect(mirrorSideOf(right)).toBeUndefined()
  })
})
