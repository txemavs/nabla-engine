import * as THREE from 'three'

export const MONITOR_COLUMNS = 80
export const MONITOR_ROWS = 24

/** Original pixel face: two expressive eyes and a small smile, with no text or green phosphor. */
export function paintMonitorFace(
  pixels: Uint8Array,
  eyeHeight = 5,
  focused = false,
  effort = false,
): void {
  if (pixels.length !== MONITOR_COLUMNS * MONITOR_ROWS * 4)
    throw new Error('Monitor face requires an 80 × 24 RGBA matrix')
  for (let y = 0; y < MONITOR_ROWS; y++) {
    for (let x = 0; x < MONITOR_COLUMNS; x++) {
      const side = x < 40 ? -1 : 1
      const centre = side < 0 ? 23 : 56
      const eyeX = (x - centre) / 10
      const eyeY = (y - 15 - side * (x - centre) * 0.08) / Math.max(0.55, eyeHeight)
      const eye = eyeX * eyeX + eyeY * eyeY <= 1
      const mouthY = focused ? 4 : 3 + Math.round(((x - 39.5) / 7) ** 2 * 2)
      const mouth = x >= 33 && x <= 46 && y >= mouthY && y < mouthY + 2
      const browY = 20 + Math.round(side * (x - centre) * 0.25)
      const brow = effort && Math.abs(x - centre) < 10 && y >= browY && y < browY + 2
      const teeth = effort && x >= 33 && x <= 46 && y >= 3 && y <= 6 && x % 3 !== 0
      const lit = eye || brow || (effort ? teeth : mouth)
      const at = (y * MONITOR_COLUMNS + x) * 4
      pixels[at] = teeth ? 160 : lit ? 35 : 1
      pixels[at + 1] = teeth ? 220 : lit ? 155 : 3
      pixels[at + 2] = lit ? 255 : 7
      pixels[at + 3] = 255
    }
  }
}

/** Owns one reusable low-resolution texture; no canvas, fonts or per-pixel meshes. */
export class MonitorFace {
  readonly texture: THREE.DataTexture
  private readonly pixels = new Uint8Array(MONITOR_COLUMNS * MONITOR_ROWS * 4)
  private time = 0
  private frame = ''
  constructor() {
    this.texture = new THREE.DataTexture(this.pixels, MONITOR_COLUMNS, MONITOR_ROWS)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.update(0)
  }
  update(elapsed: number, focused = false, effort = false): void {
    this.time =
      (this.time + (Number.isFinite(elapsed) ? Math.min(Math.max(elapsed, 0), 0.1) : 0)) % 5.4
    const blink =
      this.time > 4.8 && this.time < 5.04 ? Math.sin(((this.time - 4.8) / 0.24) * Math.PI) : 0
    const height = Math.max(0.55, Math.round((effort ? 2 : focused ? 4 : 5) * (1 - blink) * 2) / 2)
    const frame = `${height}/${focused}/${effort}`
    if (frame === this.frame) return
    this.frame = frame
    paintMonitorFace(this.pixels, height, focused, effort)
    this.texture.needsUpdate = true
  }
  dispose(): void {
    this.texture.dispose()
  }
}
