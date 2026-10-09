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
    // 5120² roof photo = 4096 cell px + 512 px (1/8 cell) each side.
    const t = photoFrameTransform('cell+margin:0.125')
    expect(t.repeat).toBeCloseTo(0.8, 12)
    expect(t.offset).toBeCloseTo(0.1, 12)
    expect(photoFrameTransform('cell')).toEqual({ repeat: 1, offset: 0 })
  })

  it('maps Atlas roofs.json footprints onto their roof pixels (cell 16221/11998)', () => {
    // Atlas roofs.json frame: 5120 px over boundsM (1.25 cell); roof_bbox_px of building
    // way/154094132 is [3674,1464]-[3705,1493] for footprint x 241.7..248.3, z -237.7..-231.7 m.
    // Local cell width 889.5 m (mercator 1222.99 m × cos 43.337°).
    const width = 889.5
    const { repeat, offset } = photoFrameTransform('cell+margin:0.125')
    const toPx = (x: number, z: number) => [
      ((0.5 + x / width) * repeat + offset) * 5120,
      (1 - ((0.5 - z / width) * repeat + offset)) * 5120,
    ]
    const [x0, y0] = toPx(241.713, -237.699)
    const [x1, y1] = toPx(248.256, -231.661)
    expect(Math.abs(x0 - 3674)).toBeLessThan(2)
    expect(Math.abs(x1 - 3705)).toBeLessThan(2)
    expect(Math.abs(y0 - 1464)).toBeLessThan(2)
    expect(Math.abs(y1 - 1493)).toBeLessThan(2)
    expect(drapeMaterialAlpha('roofs', true)).toMatchObject({ transparent: true })
    expect(drapeMaterialAlpha('roofs', true).alphaTest).toBeGreaterThan(0)
    expect(drapeMaterialAlpha('roofs', false).alphaTest).toBe(0)
    expect(drapeMaterialAlpha('terrain', true).alphaTest).toBe(0)
  })
})

/**
 * Render-level check without WebGL: build the drape meshes exactly as the planet world does, then
 * sample each roof vertex through its material's texture matrix in a synthetic roof photo that is
 * RGBA, alpha 0 / RGB 0 off-roof and in the 1/8-cell margin (like Atlas `roof`).
 */
describe('roof drape renders the roof photo (not black)', () => {
  const width = 800 // cell metres
  const px = 40 // synthetic roof photo side (margin 4 px = 1/8 cell each side, inner 32 px = cell)
  const margin = 0.125 // of the cell
  const roofImage = new Uint8ClampedArray(px * px * 4) // all alpha 0, RGB 0
  // A 56 m roof square at the cell's north-east edge, painted in the inner frame only: far from
  // the centre so a wrong frame scale (0.75 instead of 0.8) misses it.
  const roofCell = { u0: 0.88, u1: 0.95, v0: 0.04, v1: 0.11 }
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5) / px,
        v = (y + 0.5) / px
      const cu = u * (1 + 2 * margin) - margin,
        cv = v * (1 + 2 * margin) - margin
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
    const us = [0.9, 0.93, 0.915],
      vs = [0.06, 0.06, 0.09]
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

  it('a margin taken as a fraction of the image (5e07ac8: 0.75/0.125) misses the roof', () => {
    const { roofs } = dress(undefined)
    roofs.material.map!.repeat.set(0.75, 0.75)
    roofs.material.map!.offset.set(0.125, 0.125)
    const miss = roofTexels(roofs).filter((t) => t[3] === 0)
    expect(miss.length).toBeGreaterThan(0)
  })

  it('without a dedicated roof photo, roofs fall back to the opaque ground photo', () => {
    const { roofs, photo } = dress(undefined, false)
    expect(roofs.material.map!.image).toBe(photo)
    expect(roofs.material.alphaTest).toBe(0)
    expect(roofs.material.map!.repeat.x).toBe(1)
  })
})
