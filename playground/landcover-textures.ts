import * as THREE from 'three'
import type { SurfaceType } from '../src/landcover.js'
import { SURFACE_COLORS } from '../src/landcover.js'

/**
 * Procedural texture atlas for landcover surfaces.
 * 256x256 with 4 columns × 2 rows = 8 surface types.
 * Adapted from Streets GL projected texture concept (MIT).
 * See assets/licenses/streets-gl-MIT.txt.
 */
export function createLandcoverAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  const types: SurfaceType[] = [
    'grass',
    'forest',
    'farmland',
    'sand',
    'scrub',
    'water',
    'wetland',
    'rock',
  ]
  const cellWidth = 64
  const cellHeight = 128

  for (let i = 0; i < types.length; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = col * cellWidth
    const y = row * cellHeight
    const type = types[i]
    const baseColor = SURFACE_COLORS[type]

    // Fill base color
    ctx.fillStyle = baseColor
    ctx.fillRect(x, y, cellWidth, cellHeight)

    // Add procedural texture variation
    addTextureVariation(ctx, x, y, cellWidth, cellHeight, type)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function addTextureVariation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  type: SurfaceType,
) {
  const seed = type.charCodeAt(0)

  switch (type) {
    case 'grass':
      addGrassTexture(ctx, x, y, w, h, seed)
      break
    case 'forest':
      addForestTexture(ctx, x, y, w, h, seed)
      break
    case 'farmland':
      addFarmlandTexture(ctx, x, y, w, h, seed)
      break
    case 'sand':
      addSandTexture(ctx, x, y, w, h, seed)
      break
    case 'scrub':
      addScrubTexture(ctx, x, y, w, h, seed)
      break
    case 'water':
      addWaterTexture(ctx, x, y, w, h, seed)
      break
    case 'wetland':
      addWetlandTexture(ctx, x, y, w, h, seed)
      break
    case 'rock':
      addRockTexture(ctx, x, y, w, h, seed)
      break
  }
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = Math.imul(s ^ (s >>> 16), 2246822507)
    s = Math.imul(s ^ (s >>> 13), 3266489909)
    return ((s ^= s >>> 16) >>> 0) / 4294967296
  }
}

function addGrassTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  for (let i = 0; i < 80; i++) {
    const px = x + random() * w
    const py = y + random() * h
    const shade = Math.floor(random() * 30 - 15)
    ctx.fillStyle = `rgb(${124 + shade}, ${184 + shade}, ${104 + shade})`
    ctx.fillRect(px, py, 2, 3)
  }
}

function addForestTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  for (let i = 0; i < 40; i++) {
    const px = x + random() * w
    const py = y + random() * h
    const shade = Math.floor(random() * 25 - 12)
    ctx.fillStyle = `rgb(${74 + shade}, ${140 + shade}, ${58 + shade})`
    ctx.beginPath()
    ctx.arc(px, py, 3 + random() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

function addFarmlandTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  ctx.strokeStyle = 'rgba(180, 160, 100, 0.3)'
  ctx.lineWidth = 1
  for (let i = 0; i < 8; i++) {
    const py = y + (i + 0.5) * (h / 8)
    ctx.beginPath()
    ctx.moveTo(x, py + random() * 4 - 2)
    ctx.lineTo(x + w, py + random() * 4 - 2)
    ctx.stroke()
  }
}

function addSandTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  for (let i = 0; i < 100; i++) {
    const px = x + random() * w
    const py = y + random() * h
    const shade = Math.floor(random() * 20 - 10)
    ctx.fillStyle = `rgb(${232 + shade}, ${220 + shade}, ${168 + shade})`
    ctx.fillRect(px, py, 1, 1)
  }
}

function addScrubTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  for (let i = 0; i < 30; i++) {
    const px = x + random() * w
    const py = y + random() * h
    const shade = Math.floor(random() * 20 - 10)
    ctx.fillStyle = `rgb(${139 + shade}, ${168 + shade}, ${106 + shade})`
    ctx.beginPath()
    ctx.ellipse(px, py, 4, 2, random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
}

function addWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  ctx.strokeStyle = 'rgba(100, 160, 190, 0.2)'
  ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.moveTo(x, y + (i + 0.5) * (h / 6))
    for (let j = 0; j <= 4; j++) {
      ctx.lineTo(x + (j * w) / 4, y + (i + 0.5) * (h / 6) + Math.sin((j + random()) * 2) * 3)
    }
    ctx.stroke()
  }
}

function addWetlandTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  for (let i = 0; i < 20; i++) {
    const px = x + random() * w
    const py = y + random() * h
    ctx.fillStyle = 'rgba(80, 130, 100, 0.3)'
    ctx.fillRect(px, py, 1, 4)
  }
}

function addRockTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
) {
  const random = seededRandom(seed)
  for (let i = 0; i < 15; i++) {
    const px = x + random() * w
    const py = y + random() * h
    const shade = Math.floor(random() * 30 - 15)
    ctx.fillStyle = `rgb(${154 + shade}, ${154 + shade}, ${138 + shade})`
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px + 5 + random() * 5, py + random() * 3)
    ctx.lineTo(px + 3 + random() * 4, py + 5 + random() * 5)
    ctx.lineTo(px - 2, py + 3)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * Create a material for landcover surfaces with the texture atlas.
 * Water surfaces use the animated water normal instead.
 */
export function createLandcoverMaterial(atlas: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: atlas,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -0.5,
    polygonOffsetUnits: -0.5,
  })
  return material
}
