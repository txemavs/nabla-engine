/**
 * GLB 2 reader for walk/edit bodies. No Three.js.
 * File metres, Y up. ``metersYupModel`` puts that into the CSS mm world.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/gl/glbMesh.ts
 *
 * Functions
 *   parseGlb          ArrayBuffer → primitives (pos / color / normal / index / uv)
 *   decodeGlbAlbedo   PNG/JPEG in the GLB → ImageBitmap on each prim
 *   primPaint         entity RGB only on the ``Pintura`` material
 *   primGlow          ``Piloto*`` brake / ``FocoC`` + ``PilotoP`` lamps
 *   metersYupModel    entity pose (m, Y up) → column-major model matrix
 *   poseNormalMat     yaw-only 3×3 for lighting
 */
import { MM_PER_M, entityYawDeg } from '../world.js'

export type GlbWrap = 'repeat' | 'clamp'

export interface GlbAlbedo {
  mime: string
  bytes: Uint8Array
  wrap: GlbWrap
}

export type GlbAlpha = 'OPAQUE' | 'MASK' | 'BLEND'

export interface GlbPrimitive {
  positions: Float32Array
  colors: Float32Array
  normals: Float32Array
  indices: Uint16Array
  uvs?: Float32Array
  albedo?: GlbAlbedo
  albedoImage?: ImageBitmap
  alpha: GlbAlpha
  /** glTF ``materials[].name`` — body tint matches ``Pintura``. */
  material?: string
}

/** Body colour slot on the A3 / example GLBs. Wheels are ``Llanta*``. */
export function isPaintMaterial(name?: string): boolean {
  return Boolean(name && /pintura/i.test(name))
}

/** A3 rear clusters: ``PilotoP`` / ``PilotoRojo`` / ``PilotoLED`` / ``PilotoFino``. */
export function isBrakeLightMaterial(name?: string): boolean {
  return Boolean(name && /^piloto/i.test(name))
}

/** Inner headlight "C" — ``FocoC``. */
export function isHeadCMaterial(name?: string): boolean {
  return Boolean(name && /^fococ$/i.test(name.replace(/\s+/g, '')))
}

/** Rear "P" position mark — ``PilotoP``. */
export function isTailPMaterial(name?: string): boolean {
  return Boolean(name && /^pilotop$/i.test(name.replace(/\s+/g, '')))
}

/** Hot red over the authored dim tail (``uGlow`` skips Lambert). */
export const BRAKE_LIGHT_PAINT: [number, number, number] = [3.6, 2.4, 2.0]
export const BRAKE_LIGHT_GLOW = 2.6
export const HEAD_C_PAINT: [number, number, number] = [2.8, 2.9, 3.2]
export const HEAD_C_GLOW = 2.4
export const TAIL_P_PAINT: [number, number, number] = [2.4, 0.14, 0.1]
export const TAIL_P_GLOW = 1.7

export type LampMode = 'off' | 'pos' | 'low'

export function primGlow(
  prim: Pick<GlbPrimitive, 'material'>,
  state: { brake?: boolean; lamps?: LampMode } | boolean,
): { paint: [number, number, number]; glow: number } {
  const brake = typeof state === 'boolean' ? state : Boolean(state.brake)
  const lamps = typeof state === 'boolean' ? 'off' : (state.lamps ?? 'off')
  const name = prim.material
  if (brake && isBrakeLightMaterial(name)) {
    return { paint: BRAKE_LIGHT_PAINT, glow: BRAKE_LIGHT_GLOW }
  }
  if (lamps !== 'off' && isHeadCMaterial(name)) {
    const hot = lamps === 'low' ? 1.15 : 1
    return { paint: HEAD_C_PAINT, glow: HEAD_C_GLOW * hot }
  }
  if (lamps !== 'off' && isTailPMaterial(name)) {
    return { paint: TAIL_P_PAINT, glow: TAIL_P_GLOW }
  }
  return { paint: [1, 1, 1], glow: 0 }
}

/** ``uPaint`` only on Pintura. Glass / wheels / chrome stay the authored colour. */
export function primPaint(
  prim: Pick<GlbPrimitive, 'alpha' | 'material'>,
  paint?: [number, number, number],
): [number, number, number] {
  if (!paint || prim.alpha === 'BLEND' || !isPaintMaterial(prim.material)) return [1, 1, 1]
  return paint
}

export interface RoomMeshPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch?: number
  roll?: number
  /** Full body quat wins over Euler when present (driven car). */
  qx?: number
  qy?: number
  qz?: number
  qw?: number
  /** Rotate pitch/roll about this model-space point (cabin), not the file origin. */
  pivot?: { x: number; y: number; z: number }
  /** Uniform extra scale on the metres→mm model. 1 = file size. */
  scale?: number
  /** Non-uniform X scale for mirroring (-1 = mirror). Normals flipped when negative. */
  scaleX?: number
}

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const GL_FLOAT = 5126
const GL_UNSIGNED_BYTE = 5121
const GL_UNSIGNED_SHORT = 5123
const GL_UNSIGNED_INT = 5125
const GL_REPEAT = 10497
const COMP_SIZE: Record<number, number> = {
  [GL_FLOAT]: 4,
  [GL_UNSIGNED_BYTE]: 1,
  [GL_UNSIGNED_SHORT]: 2,
  [GL_UNSIGNED_INT]: 4,
}
const TYPE_COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

type GlNode = {
  mesh?: number
  children?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
  matrix?: number[]
}

function identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
}

function rot4(r: Float32Array): Float32Array {
  return new Float32Array([
    r[0], r[1], r[2], 0,
    r[3], r[4], r[5], 0,
    r[6], r[7], r[8], 0,
    0, 0, 0, 1,
  ])
}

function trans4(x: number, y: number, z: number): Float32Array {
  const m = identity()
  m[12] = x
  m[13] = y
  m[14] = z
  return m
}

function scale4(s: number): Float32Array {
  return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1])
}

/** p' = M · (x,y,z,1) — column-major. */
export function xformPoint(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    }
  }
  return o
}

/** glTF node TRS → column-major 4×4. */
export function nodeMatrix(node: GlNode): Float32Array {
  if (node.matrix && node.matrix.length === 16) return Float32Array.from(node.matrix)
  const t = node.translation || [0, 0, 0]
  const s = node.scale || [1, 1, 1]
  const q = node.rotation || [0, 0, 0, 1]
  const x = q[0]
  const y = q[1]
  const z = q[2]
  const w = q[3]
  const xx = x * x
  const yy = y * y
  const zz = z * z
  const xy = x * y
  const xz = x * z
  const yz = y * z
  const wx = w * x
  const wy = w * y
  const wz = w * z
  return new Float32Array([
    (1 - 2 * (yy + zz)) * s[0],
    2 * (xy + wz) * s[0],
    2 * (xz - wy) * s[0],
    0,
    2 * (xy - wz) * s[1],
    (1 - 2 * (xx + zz)) * s[1],
    2 * (yz + wx) * s[1],
    0,
    2 * (xz + wy) * s[2],
    2 * (yz - wx) * s[2],
    (1 - 2 * (xx + yy)) * s[2],
    0,
    t[0],
    t[1],
    t[2],
    1,
  ])
}

function xformPoints(m: Float32Array, src: Float32Array): Float32Array {
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]
    const y = src[i + 1]
    const z = src[i + 2]
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
  return out
}

function xformNormals(m: Float32Array, src: Float32Array): Float32Array {
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]
    const y = src[i + 1]
    const z = src[i + 2]
    let nx = m[0] * x + m[4] * y + m[8] * z
    let ny = m[1] * x + m[5] * y + m[9] * z
    let nz = m[2] * x + m[6] * y + m[10] * z
    const l = Math.hypot(nx, ny, nz) || 1
    out[i] = nx / l
    out[i + 1] = ny / l
    out[i + 2] = nz / l
  }
  return out
}

/** Face-average normals when the GLB has no NORMAL accessor. */
export function computeVertexNormals(positions: Float32Array, indices: Uint16Array): Float32Array {
  const acc = new Float32Array(positions.length)
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3
    const b = indices[i + 1] * 3
    const c = indices[i + 2] * 3
    const ax = positions[b] - positions[a]
    const ay = positions[b + 1] - positions[a + 1]
    const az = positions[b + 2] - positions[a + 2]
    const bx = positions[c] - positions[a]
    const by = positions[c + 1] - positions[a + 1]
    const bz = positions[c + 2] - positions[a + 2]
    const nx = ay * bz - az * by
    const ny = az * bx - ax * bz
    const nz = ax * by - ay * bx
    acc[a] += nx
    acc[a + 1] += ny
    acc[a + 2] += nz
    acc[b] += nx
    acc[b + 1] += ny
    acc[b + 2] += nz
    acc[c] += nx
    acc[c + 1] += ny
    acc[c + 2] += nz
  }
  for (let i = 0; i < acc.length; i += 3) {
    const l = Math.hypot(acc[i], acc[i + 1], acc[i + 2]) || 1
    acc[i] /= l
    acc[i + 1] /= l
    acc[i + 2] /= l
  }
  return acc
}

/** Tiles/metre when a textured material has no TEXCOORD (flake / glass maps). */
export const GLB_BOX_UV_PER_M = 0.45

export function boxProjectUv(local: Float32Array, tilesPerM = GLB_BOX_UV_PER_M): Float32Array {
  const uv = new Float32Array((local.length / 3) * 2)
  for (let i = 0; i < local.length / 3; i++) {
    uv[i * 2] = local[i * 3] * tilesPerM
    uv[i * 2 + 1] = local[i * 3 + 1] * tilesPerM
  }
  return uv
}

export async function decodeGlbAlbedo(prims: GlbPrimitive[]): Promise<void> {
  if (typeof createImageBitmap !== 'function') return
  const cache = new Map<Uint8Array, Promise<ImageBitmap>>()
  await Promise.all(
    prims.map(async (prim) => {
      if (!prim.albedo || prim.albedoImage) return
      let pending = cache.get(prim.albedo.bytes)
      if (!pending) {
        const blob = new Blob([prim.albedo.bytes as BlobPart], { type: prim.albedo.mime })
        pending = createImageBitmap(blob)
        cache.set(prim.albedo.bytes, pending)
      }
      prim.albedoImage = await pending
    }),
  )
}

export function parseGlb(buf: ArrayBuffer): GlbPrimitive[] {
  const u8 = new Uint8Array(buf)
  const dv = new DataView(buf)
  if (u8.length < 12 || String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'glTF') {
    throw new Error('not a GLB')
  }
  if (dv.getUint32(4, true) !== 2) throw new Error('GLB version')
  let off = 12
  let json: Record<string, unknown> | null = null
  let bin: ArrayBuffer | null = null
  while (off + 8 <= u8.length) {
    const len = dv.getUint32(off, true)
    const type = dv.getUint32(off + 4, true)
    const start = off + 8
    const slice = buf.slice(start, start + len)
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(slice))
    if (type === BIN_CHUNK) bin = slice
    off = start + len
  }
  if (!json || !bin) throw new Error('GLB chunks')
  const binDv = new DataView(bin)
  const accessors = (json.accessors as Record<string, unknown>[]) || []
  const views = (json.bufferViews as Record<string, unknown>[]) || []
  const meshes = (json.meshes as { primitives?: Record<string, unknown>[] }[]) || []
  const materials =
    (json.materials as {
      name?: string
      alphaMode?: string
      pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { index?: number } }
    }[]) || []
  const images = (json.images as { mimeType?: string; bufferView?: number; uri?: string }[]) || []
  const textures = (json.textures as { source?: number; sampler?: number }[]) || []
  const samplers = (json.samplers as { wrapS?: number; wrapT?: number }[]) || []
  const nodes = ((json.nodes as GlNode[]) || []) as GlNode[]
  const scenes = (json.scenes as { nodes?: number[] }[]) || []
  const scene = scenes[(json.scene as number) || 0]

  const viewSlice = (index: number): { off: number; len: number; stride?: number } => {
    const v = views[index]
    return {
      off: (v.byteOffset as number) || 0,
      len: (v.byteLength as number) || 0,
      stride: v.byteStride as number | undefined,
    }
  }

  const readF32 = (acc: number): Float32Array => {
    const a = accessors[acc]
    const comps = TYPE_COMPS[(a.type as string) || 'SCALAR'] || 1
    const count = a.count as number
    const view = viewSlice(a.bufferView as number)
    const off0 = view.off + ((a.byteOffset as number) || 0)
    const ct = (a.componentType as number) || GL_FLOAT
    const elem = COMP_SIZE[ct] || 4
    const stride = view.stride || comps * elem
    const out = new Float32Array(count * comps)
    for (let i = 0; i < count; i++) {
      const p = off0 + i * stride
      for (let c = 0; c < comps; c++) {
        const q = p + c * elem
        out[i * comps + c] =
          ct === GL_FLOAT
            ? binDv.getFloat32(q, true)
            : ct === GL_UNSIGNED_SHORT
              ? binDv.getUint16(q, true) / 65535
              : binDv.getUint8(q) / 255
      }
    }
    return out
  }

  const readIndices = (acc: number): Uint16Array => {
    const a = accessors[acc]
    const count = a.count as number
    const view = viewSlice(a.bufferView as number)
    const off0 = view.off + ((a.byteOffset as number) || 0)
    const ct = a.componentType as number
    const out = new Uint16Array(count)
    for (let i = 0; i < count; i++) {
      const v =
        ct === GL_UNSIGNED_INT
          ? binDv.getUint32(off0 + i * 4, true)
          : ct === GL_UNSIGNED_BYTE
            ? binDv.getUint8(off0 + i)
            : binDv.getUint16(off0 + i * 2, true)
      out[i] = v > 65535 ? 65535 : v
    }
    return out
  }

  const alphaOf = (prim: Record<string, unknown>): GlbAlpha => {
    const mat = typeof prim.material === 'number' ? materials[prim.material] : null
    const mode = mat?.alphaMode
    if (mode === 'BLEND') return 'BLEND'
    if (mode === 'MASK') return 'MASK'
    const a = mat?.pbrMetallicRoughness?.baseColorFactor?.[3]
    if (a != null && a < 0.999) return 'BLEND'
    return 'OPAQUE'
  }

  const albedoOf = (prim: Record<string, unknown>): GlbAlbedo | undefined => {
    const mat = typeof prim.material === 'number' ? materials[prim.material] : null
    const tex = mat?.pbrMetallicRoughness?.baseColorTexture
    if (tex?.index == null) return undefined
    const texture = textures[tex.index]
    const img = images[texture?.source ?? -1]
    if (!img || img.bufferView == null) return undefined
    const slice = viewSlice(img.bufferView)
    const wrapN = samplers[texture?.sampler ?? -1]?.wrapS
    return {
      mime: img.mimeType || 'image/png',
      bytes: new Uint8Array(bin!, slice.off, slice.len),
      wrap: wrapN === GL_REPEAT || wrapN == null ? 'repeat' : 'clamp',
    }
  }

  const fillColor = (prim: Record<string, unknown>, n: number): Float32Array => {
    const attr = (prim.attributes as Record<string, number>) || {}
    if (attr.COLOR_0 != null) {
      const raw = readF32(attr.COLOR_0)
      if (raw.length === n * 3) return new Float32Array(raw)
      const rgb = new Float32Array(n * 3)
      const stride = raw.length === n * 4 ? 4 : 3
      for (let i = 0; i < n; i++) {
        rgb[i * 3] = raw[i * stride] ?? 0.55
        rgb[i * 3 + 1] = raw[i * stride + 1] ?? 0.55
        rgb[i * 3 + 2] = raw[i * stride + 2] ?? 0.52
      }
      return rgb
    }
    const mat = typeof prim.material === 'number' ? materials[prim.material] : null
    const f = mat?.pbrMetallicRoughness?.baseColorFactor
    const r = f?.[0] ?? 0.55
    const g = f?.[1] ?? 0.58
    const b = f?.[2] ?? 0.52
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }
    return colors
  }

  const emitMesh = (meshIndex: number, world: Float32Array, out: GlbPrimitive[]) => {
    const mesh = meshes[meshIndex]
    if (!mesh) return
    for (const prim of mesh.primitives || []) {
      const attr = (prim.attributes as Record<string, number>) || {}
      if (attr.POSITION == null || prim.indices == null) continue
      const local = readF32(attr.POSITION)
      const positions = world ? xformPoints(world, local) : new Float32Array(local)
      const n = positions.length / 3
      const indices = readIndices(prim.indices as number)
      const normals =
        attr.NORMAL != null
          ? xformNormals(world || identity(), readF32(attr.NORMAL))
          : computeVertexNormals(positions, indices)
      const albedo = albedoOf(prim)
      const uvs =
        attr.TEXCOORD_0 != null
          ? readF32(attr.TEXCOORD_0)
          : albedo
            ? boxProjectUv(local)
            : undefined
      const mat = typeof prim.material === 'number' ? materials[prim.material] : null
      out.push({
        positions,
        colors: fillColor(prim, n),
        normals,
        indices,
        uvs,
        albedo,
        alpha: alphaOf(prim),
        ...(mat?.name ? { material: mat.name } : {}),
      })
    }
  }

  const out: GlbPrimitive[] = []
  const roots = scene?.nodes ?? nodes.map((_, i) => i)
  if (nodes.length && roots.length) {
    const walk = (index: number, parent: Float32Array) => {
      const node = nodes[index]
      if (!node) return
      const world = mul4(parent, nodeMatrix(node))
      if (node.mesh != null) emitMesh(node.mesh, world, out)
      for (const child of node.children || []) walk(child, world)
    }
    for (const root of roots) walk(root, identity())
  } else {
    for (let i = 0; i < meshes.length; i++) emitMesh(i, identity(), out)
  }
  return out
}

/** Ry(yaw) · Rx(pitch) · Rz(roll) — same yaw as ``driveForward``. */
export function poseRotation(pose: RoomMeshPose): Float32Array {
  const yaw = (entityYawDeg(pose.yaw) * Math.PI) / 180
  const pitch = ((pose.pitch ?? 0) * Math.PI) / 180
  const roll = ((pose.roll ?? 0) * Math.PI) / 180
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cx = Math.cos(pitch)
  const sx = Math.sin(pitch)
  const cz = Math.cos(roll)
  const sz = Math.sin(roll)
  return new Float32Array([
    cy * cz + sy * sx * sz,
    cx * sz,
    -sy * cz + cy * sx * sz,
    cy * -sz + sy * sx * cz,
    cx * cz,
    -sy * -sz + cy * sx * cz,
    sy * cx,
    -sx,
    cy * cx,
  ])
}

/**
 * Metres Y-up + yaw/pitch/roll → GL mm (same axis as cssToGl).
 * Pitch/roll orbit ``pivot`` (cabin) so a nose-origin GLB does not cartwheel
 * around the right-front bumper.
 */
function quatRotation3(q: { qx?: number; qy?: number; qz?: number; qw?: number }): Float32Array {
  const x = q.qx ?? 0
  const y = q.qy ?? 0
  const z = q.qz ?? 0
  const w = q.qw ?? 1
  const xx = x * x
  const yy = y * y
  const zz = z * z
  return new Float32Array([
    1 - 2 * (yy + zz),
    2 * (x * y + w * z),
    2 * (x * z - w * y),
    2 * (x * y - w * z),
    1 - 2 * (xx + zz),
    2 * (y * z + w * x),
    2 * (x * z + w * y),
    2 * (y * z - w * x),
    1 - 2 * (xx + yy),
  ])
}

export function metersYupModel(pose: RoomMeshPose): Float32Array {
  const s = MM_PER_M * (pose.scale && pose.scale > 0 ? pose.scale : 1)
  const sx = pose.scaleX ?? 1
  const p = pose.pivot
  if (pose.qw != null || pose.qx != null || pose.qy != null || pose.qz != null) {
    const r = quatRotation3(pose)
    return new Float32Array([
      s * sx * r[0], s * sx * r[1], s * sx * r[2], 0,
      s * r[3], s * r[4], s * r[5], 0,
      s * r[6], s * r[7], s * r[8], 0,
      pose.x * s, pose.y * s, pose.z * s, 1,
    ])
  }
  if (!p || (!p.x && !p.y && !p.z)) {
    const r = poseRotation(pose)
    return new Float32Array([
      s * sx * r[0], s * sx * r[1], s * sx * r[2], 0,
      s * r[3], s * r[4], s * r[5], 0,
      s * r[6], s * r[7], s * r[8], 0,
      pose.x * s, pose.y * s, pose.z * s, 1,
    ])
  }
  const Ry = rot4(poseRotation({ ...pose, pitch: 0, roll: 0 }))
  const Rpr = rot4(poseRotation({ ...pose, yaw: 0 }))
  const base = mul4(
    scale4(s),
    mul4(
      trans4(pose.x, pose.y, pose.z),
      mul4(Ry, mul4(trans4(p.x, p.y, p.z), mul4(Rpr, trans4(-p.x, -p.y, -p.z)))),
    ),
  )
  if (sx !== 1) {
    base[0] *= sx
    base[1] *= sx
    base[2] *= sx
  }
  return base
}

/** 3×3 for lighting — same rotation as ``metersYupModel``. Flips normals when scaleX < 0. */
export function poseNormalMat(pose: RoomMeshPose): Float32Array {
  const sx = pose.scaleX ?? 1
  const r =
    pose.qw != null || pose.qx != null || pose.qy != null || pose.qz != null
      ? quatRotation3(pose)
      : poseRotation(pose)
  if (sx < 0) {
    r[0] *= sx
    r[1] *= sx
    r[2] *= sx
  }
  return r
}
