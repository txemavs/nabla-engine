import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  adaptAtlasManifest,
  atlasFile,
  validateAtlasZ15Package,
} from '../../src/planet/atlas-z15.js'
import type { PlanetManifest } from '../../src/planet/contract.js'
import {
  drapeMaterialAlpha,
  photoFrameMargin,
  photoFrameTransform,
  type DrapeGeometry,
} from '../../src/render/planet/drape.js'
import { dressSatelliteRoofs } from '../../src/render/planet/world.js'
import type { MapTile } from '../../src/scene/mercator.js'

// Real Atlas metadata (cell 15/16211/12003): the package ships ground.composite (roofs painted in),
// ground.lots (roofs punched out) and the lean-corrected roof photo (5120², cell+margin:0.125).
const dir = new URL('../planet/fixtures/atlas-16211-12003/', import.meta.url)
const tile: MapTile = { z: 15, x: 16211, y: 12003 }
const manifest = () =>
  JSON.parse(readFileSync(new URL('manifest.json', dir)).toString()) as PlanetManifest
const pkg = () =>
  validateAtlasZ15Package(
    JSON.parse(readFileSync(new URL('z15-059a2665959db8a9.json', dir)).toString()),
    tile,
  )

describe('Atlas photo roles (techo suelto regression)', () => {
  it('ground/roads drape uses ground.lots, never ground.composite, when lots exist', () => {
    const p = pkg()
    const lots = atlasFile(p, 'ground.lots')!
    const lotsLo = atlasFile(p, 'ground.lots.lo')!
    const composite = atlasFile(p, 'ground.composite')!
    const compositeLo = atlasFile(p, 'ground.composite.lo')!
    expect(lots && composite).toBeTruthy()
    const full = adaptAtlasManifest(manifest(), p)
    expect(full.photo?.path).toBe(lots.path)
    expect(full.photo?.path).not.toBe(composite.path)
    const lo = adaptAtlasManifest(manifest(), p, { photo: 'lo' })
    expect(lo.photo?.path).toBe(lotsLo.path)
    expect(lo.photo?.path).not.toBe(compositeLo.path)
  })

  it('falls back to ground.composite only when the package has no ground.lots', () => {
    const p = pkg()
    const composite = atlasFile(p, 'ground.composite')!
    const noLots = { ...p, files: p.files.filter((f) => !f.role.startsWith('ground.lots')) }
    expect(adaptAtlasManifest(manifest(), noLots as typeof p).photo?.path).toBe(composite.path)
  })

  it('roofs use the roof / roof.lo photo and keep its margin frame', () => {
    const p = pkg()
    const roof = atlasFile(p, 'roof')!
    const roofLo = atlasFile(p, 'roof.lo')!
    expect(roof.frame).toBe('cell+margin:0.125')
    const full = adaptAtlasManifest(manifest(), p)
    expect(full.roofPhoto).toMatchObject({
      path: roof.path,
      sizePx: 5120,
      frame: 'cell+margin:0.125',
    })
    expect(adaptAtlasManifest(manifest(), p, { photo: 'lo' }).roofPhoto).toMatchObject({
      path: roofLo.path,
      frame: roofLo.frame,
    })
    expect(full.photo?.frame).toBe('cell')
  })
})

describe('roof photo frame', () => {
  it('parses the Atlas frame', () => {
    expect(photoFrameMargin(undefined)).toBe(0)
    expect(photoFrameMargin('cell')).toBe(0)
    expect(photoFrameMargin('cell+margin:0.125')).toBe(0.125)
    expect(photoFrameMargin('cell+margin:0.7')).toBe(0)
    expect(photoFrameTransform('cell+margin:0.125')).toEqual({ repeat: 0.75, offset: 0.125 })
    expect(drapeMaterialAlpha('roofs', true)).toMatchObject({ transparent: true })
    expect(drapeMaterialAlpha('roofs', true).alphaTest).toBeGreaterThan(0)
    expect(drapeMaterialAlpha('roofs', false).alphaTest).toBe(0)
    expect(drapeMaterialAlpha('terrain', true).alphaTest).toBe(0)
  })
})

/**
 * Render-level check without WebGL: build the drape meshes exactly as the planet world does, then
 * sample each roof vertex through its material's texture matrix in a synthetic roof photo that is
 * RGBA, alpha 0 / RGB 0 off-roof and in the 12.5 % margin (like Atlas `roof`).
 */
describe('roof drape renders the roof photo (not black)', () => {
  const width = 800 // cell metres
  const px = 40 // synthetic roof photo side (margin 5 px each side, inner 30 px = cell)
  const margin = 0.125
  const roofImage = new Uint8ClampedArray(px * px * 4) // all alpha 0, RGB 0
  // A 120 m roof square near the cell's north-east corner, painted in the inner frame only.
  const roofCell = { u0: 0.7, u1: 0.85, v0: 0.1, v1: 0.25 }
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5) / px,
        v = (y + 0.5) / px
      const cu = (u - margin) / (1 - 2 * margin),
        cv = (v - margin) / (1 - 2 * margin)
      if (cu < roofCell.u0 || cu > roofCell.u1 || cv < roofCell.v0 || cv > roofCell.v1) continue
      roofImage.set([180, 120, 100, 255], (y * px + x) * 4)
    }
  const sample = (u: number, v: number) => {
    const x = Math.min(px - 1, Math.max(0, Math.floor(u * px)))
    const y = Math.min(px - 1, Math.max(0, Math.floor(v * px)))
    return roofImage.slice((y * px + x) * 4, (y * px + x) * 4 + 4)
  }
  // Roof drape vertices at the roof's centre region, with cell UVs as buildDrapes writes them.
  const roofDrape = (): DrapeGeometry => {
    const us = [0.75, 0.8, 0.775],
      vs = [0.15, 0.15, 0.2]
    const position = new Float32Array(9),
      uv = new Float32Array(6)
    for (let i = 0; i < 3; i++) {
      position[i * 3] = (us[i] - 0.5) * width
      position[i * 3 + 1] = 12
      position[i * 3 + 2] = (0.5 - vs[i]) * width
      uv[i * 2] = us[i]
      uv[i * 2 + 1] = vs[i]
    }
    return { id: 'roofs', position, uv }
  }
  const ground: DrapeGeometry = {
    id: 'terrain',
    position: new Float32Array(9),
    uv: new Float32Array(6),
  }
  const dress = (roofFrame: string | undefined, withRoofPhoto = true) => {
    const p = pkg()
    const m = adaptAtlasManifest(manifest(), p)
    if (roofFrame) m.roofPhoto = { ...m.roofPhoto!, frame: roofFrame }
    const group = new THREE.Group()
    const photo = { width: 4096, height: 4096, close() {} } as unknown as ImageBitmap
    const roofPhoto = { width: 5120, height: 5120, close() {} } as unknown as ImageBitmap
    dressSatelliteRoofs(
      group,
      { ...m, tile: { z: 15, x: tile.x, y: tile.y } } as PlanetManifest,
      () => {},
      () => {},
      'package',
      'cell/' + m.photo!.path,
      undefined,
      undefined,
      { drapes: [ground, roofDrape()], photo, ...(withRoofPhoto ? { roofPhoto } : {}) },
    )
    const by = (id: string) =>
      group.children.find((n) => (n as THREE.Mesh).userData.drape === id) as THREE.Mesh<
        THREE.BufferGeometry,
        THREE.MeshStandardMaterial
      >
    return { roofs: by('roofs'), terrain: by('terrain'), photo, roofPhoto }
  }
  const roofTexels = (mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) => {
    const map = mesh.material.map!
    map.updateMatrix()
    const uv = mesh.geometry.getAttribute('uv')
    const out: Uint8ClampedArray[] = []
    for (let i = 0; i < uv.count; i++) {
      const t = new THREE.Vector2(uv.getX(i), uv.getY(i)).applyMatrix3(map.matrix)
      out.push(sample(t.x, t.y))
    }
    return out
  }

  it('roof material has the roof photo, ground keeps the lots photo', () => {
    const { roofs, terrain, photo, roofPhoto } = dress(undefined)
    expect(roofs.visible).toBe(true)
    expect(roofs.material.map).toBeTruthy()
    expect(roofs.material.map!.image).toBe(roofPhoto)
    expect(terrain.material.map!.image).toBe(photo)
    expect(roofs.material.map).not.toBe(terrain.material.map)
    expect(roofs.material.alphaTest).toBeGreaterThan(0)
  })

  it('every roof vertex samples an opaque, non-black roof texel', () => {
    for (const texel of roofTexels(dress(undefined).roofs)) {
      expect(texel[3]).toBe(255)
      expect(Math.max(texel[0], texel[1], texel[2])).toBeGreaterThan(40)
    }
  })

  it('ignoring the margin frame (c33903c) samples the black transparent texels', () => {
    const black = roofTexels(dress('cell').roofs).filter((t) => t[3] === 0)
    expect(black.length).toBeGreaterThan(0)
  })

  it('without a dedicated roof photo, roofs fall back to the opaque ground photo', () => {
    const { roofs, photo } = dress(undefined, false)
    expect(roofs.material.map!.image).toBe(photo)
    expect(roofs.material.alphaTest).toBe(0)
    expect(roofs.material.map!.repeat.x).toBe(1)
  })
})
