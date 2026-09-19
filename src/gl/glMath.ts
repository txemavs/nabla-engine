/**
 * Vec + matrices + rays. No WebGL context.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/gl/glMath.ts
 */

export type Vec3 = [number, number, number]
export type Vec2 = [number, number]

export function cssToGl(p: Vec3): Vec3 {
  return [p[0], -p[1], p[2]]
}

export function scaleViewTranslation(view: Float32Array, s: number): Float32Array {
  const o = new Float32Array(view)
  o[12] *= s
  o[13] *= s
  o[14] *= s
  return o
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3): Float32Array {
  const zx = eye[0] - target[0]
  const zy = eye[1] - target[1]
  const zz = eye[2] - target[2]
  const zlen = Math.hypot(zx, zy, zz) || 1
  const z0 = zx / zlen
  const z1 = zy / zlen
  const z2 = zz / zlen
  let x0 = up[1] * z2 - up[2] * z1
  let x1 = up[2] * z0 - up[0] * z2
  let x2 = up[0] * z1 - up[1] * z0
  const xlen = Math.hypot(x0, x1, x2) || 1
  x0 /= xlen
  x1 /= xlen
  x2 /= xlen
  const y0 = z1 * x2 - z2 * x1
  const y1 = z2 * x0 - z0 * x2
  const y2 = z0 * x1 - z1 * x0
  return new Float32Array([
    x0, y0, z0, 0,
    x1, y1, z1, 0,
    x2, y2, z2, 0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
    1,
  ])
}

export function perspective(fovyDeg: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovyDeg * Math.PI) / 360)
  const nf = 1 / (near - far)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ])
}

/** OpenGL frustum, same column-major layout as ``perspective``. */
export function frustum(l: number, r: number, b: number, t: number, n: number, f: number): Float32Array {
  const rl = 1 / (r - l)
  const tb = 1 / (t - b)
  const nf = 1 / (n - f)
  return new Float32Array([
    2 * n * rl, 0, 0, 0,
    0, 2 * n * tb, 0, 0,
    (r + l) * rl, (t + b) * tb, (f + n) * nf, -1,
    0, 0, 2 * f * n * nf, 0,
  ])
}

export function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3]
    }
  }
  return o
}

export function invert4(m: Float32Array): Float32Array | null {
  const inv = new Float32Array(16)
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10]
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10]
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9]
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9]
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10]
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10]
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9]
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9]
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6]
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6]
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5]
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5]
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6]
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6]
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5]
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5]
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12]
  if (Math.abs(det) < 1e-10) return null
  const idet = 1 / det
  for (let i = 0; i < 16; i++) inv[i] *= idet
  return inv
}

export function transformPoint(m: Float32Array, p: Vec3): Vec3 {
  const x = p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12]
  const y = p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13]
  const z = p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14]
  const w = p[0] * m[3] + p[1] * m[7] + p[2] * m[11] + m[15]
  const iw = w || 1
  return [x / iw, y / iw, z / iw]
}

export function rayQuadHit(origin: Vec3, dir: Vec3, q: [Vec3, Vec3, Vec3, Vec3]): number | null {
  const a = hitTri(origin, dir, q[0], q[1], q[2])
  const b = hitTri(origin, dir, q[0], q[2], q[3])
  if (a == null) return b
  if (b == null) return a
  return Math.min(a, b)
}

export function hitTri(o: Vec3, d: Vec3, v0: Vec3, v1: Vec3, v2: Vec3): number | null {
  const e1: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]]
  const e2: Vec3 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]]
  const hx = d[1] * e2[2] - d[2] * e2[1]
  const hy = d[2] * e2[0] - d[0] * e2[2]
  const hz = d[0] * e2[1] - d[1] * e2[0]
  const a = e1[0] * hx + e1[1] * hy + e1[2] * hz
  if (Math.abs(a) < 1e-8) return null
  const f = 1 / a
  const s: Vec3 = [o[0] - v0[0], o[1] - v0[1], o[2] - v0[2]]
  const u = f * (s[0] * hx + s[1] * hy + s[2] * hz)
  if (u < 0 || u > 1) return null
  const qx = s[1] * e1[2] - s[2] * e1[1]
  const qy = s[2] * e1[0] - s[0] * e1[2]
  const qz = s[0] * e1[1] - s[1] * e1[0]
  const v = f * (d[0] * qx + d[1] * qy + d[2] * qz)
  if (v < 0 || u + v > 1) return null
  const t = f * (e2[0] * qx + e2[1] * qy + e2[2] * qz)
  return t > 1e-4 ? t : null
}
