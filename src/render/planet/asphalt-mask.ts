/**
 * Road mask for the asphalt contrast on photo-draped terrain. With `relief=lidar` (and wherever the
 * cell has no road meshes) the asphalt is only pixels of the terrain orthophoto, so the contrast
 * needs to know which of them are road: the cell's OSM carriageways, rasterised once into a small
 * single-channel texture in the drape's planar UVs. The photo texture is never modified.
 */
import * as THREE from 'three'

/** Mask resolution per cell (about 1.7 m per texel on a Z15 cell); single channel, 256 KB. */
export const ASPHALT_MASK_SIZE = 512

/** Fraction of the OSM width painted: OSM widths include verges more often than not. */
const ASPHALT_MASK_WIDTH = 0.9

/** 1×1 "no road" mask: masked drapes sample it until their cell's roads arrive. */
export const NO_ASPHALT_MASK = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat)
  texture.needsUpdate = true
  return texture
})()

/** A road centreline in the cell's drape frame (metres, cell-local X/Z) with its width. */
export interface AsphaltMaskRoad {
  points: readonly { x: number; z: number }[]
  width: number
}

/**
 * Rasterise carriageways into a mask texture over a cell `width` metres wide (UV `0.5 + x/width`,
 * `0.5 - z/width`, as the drape). Null when no road crosses the cell.
 */
export function asphaltMaskTexture(
  roads: readonly AsphaltMaskRoad[],
  width: number,
  size = ASPHALT_MASK_SIZE,
): THREE.DataTexture | null {
  if (!roads.length || !(width > 0)) return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const scale = size / width
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  let drawn = 0
  for (const road of roads) {
    if (road.points.length < 2 || !(road.width > 0)) continue
    ctx.lineWidth = Math.max(1, road.width * ASPHALT_MASK_WIDTH * scale)
    ctx.beginPath()
    road.points.forEach((p, i) => {
      // Canvas row 0 is the top of the cell (v = 1, north, -z).
      const px = (0.5 + p.x / width) * size
      const py = (0.5 + p.z / width) * size
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
    drawn++
  }
  if (!drawn) return null
  const rgba = ctx.getImageData(0, 0, size, size).data
  const mask = new Uint8Array(size * size)
  let any = false
  // DataTexture row 0 is v = 0 (south), so flip the canvas rows.
  for (let row = 0; row < size; row++) {
    const from = (size - 1 - row) * size
    for (let col = 0; col < size; col++) {
      const value = rgba[(from + col) * 4]
      mask[row * size + col] = value
      if (value) any = true
    }
  }
  if (!any) return null
  const texture = new THREE.DataTexture(mask, size, size, THREE.RedFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
