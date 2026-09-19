/**
 * Kind-specific properties. Kind.props is schema + defaults.
 * Entity.props is a sparse overlay. Do not invent keys the kind omitted
 * — client defaults fill empty shipped bags (create-only fixtures).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/kind/kindProps.ts
 *
 * Container box: ``size`` is the exterior AABB. Six ``skin``
 * thicknesses (metres on the wire; inspector edits mm) inset an
 * inner liner — the rest of xyzr is derived. 0 = no liner on
 * that face (GLB interior shows).
 */
import type { StageImageRef } from './types.js'
import type { Aabb3 } from './entityAabb.js'

export const HULL_FACES = ['left', 'right', 'floor', 'front', 'back', 'top'] as const
export type HullFace = (typeof HULL_FACES)[number]

export const BOX_FACES = [...HULL_FACES, 'divider_fore', 'divider_aft'] as const

export type BoxFace = (typeof BOX_FACES)[number]

import type { InteriorRender } from '../interior/interior.js'

/** @deprecated Use `InteriorRender` from `interior/interior.js` instead. */
export type InteriorKind = InteriorRender

export interface BoxSize {
  w: number
  h: number
  d: number
}

/** 5×10×3.20 m — same AABB as ``HOME_INTERIOR_AABB``. */
export const CONTAINER_SIZE: BoxSize = { w: 5, h: 3.2, d: 10 }

/** Per-face wall thickness (m). 0 = flush with the exterior / no liner. */
export type BoxSkin = Record<HullFace, number>

export const ZERO_SKIN: BoxSkin = {
  left: 0,
  right: 0,
  floor: 0,
  top: 0,
  front: 0,
  back: 0,
}

/** Any liner on → t=0 faces stay off (steel / hole). All-zero paints the atlas. */
export function hasLiner(skin?: BoxSkin | null): boolean {
  if (!skin) return false
  return HULL_FACES.some((face) => (skin[face] ?? 0) > 1e-6)
}

const MIN_INNER_M = 0.2

export function clampSkin(size: BoxSize, skin: BoxSkin = ZERO_SKIN): BoxSkin {
  const raw: BoxSkin = { ...ZERO_SKIN }
  for (const face of HULL_FACES) {
    const n = skin[face]
    raw[face] = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0
  }
  const fit = (a: number, b: number, span: number) => {
    const max = Math.max(0, span - MIN_INNER_M)
    const sum = a + b
    if (sum <= max || sum <= 0) return [a, b] as const
    return [a * (max / sum), b * (max / sum)] as const
  }
  const [left, right] = fit(raw.left, raw.right, size.w)
  const [floor, top] = fit(raw.floor, raw.top, size.h)
  const [front, back] = fit(raw.front, raw.back, size.d)
  return { left, right, floor, top, front, back }
}

export function innerBoxSize(size: BoxSize = CONTAINER_SIZE, skin: BoxSkin = ZERO_SKIN): BoxSize {
  const s = clampSkin(size, skin)
  return {
    w: Math.max(MIN_INNER_M, size.w - s.left - s.right),
    h: Math.max(MIN_INNER_M, size.h - s.floor - s.top),
    d: Math.max(MIN_INNER_M, size.d - s.front - s.back),
  }
}

/** Inner liner AABB. ``nave`` = z=0 proa (sit CSS). ``mesh`` = midship (walk-GL). */
export function innerBoxAabb(
  size: BoxSize = CONTAINER_SIZE,
  skin: BoxSkin = ZERO_SKIN,
  frame: 'nave' | 'mesh' = 'nave',
): Aabb3 {
  const s = clampSkin(size, skin)
  const shift = frame === 'mesh' ? -size.d / 2 : 0
  return {
    min: [-size.w / 2 + s.left, s.floor, s.front + shift],
    max: [size.w / 2 - s.right, size.h - s.top, size.d - s.back + shift],
  }
}

export type BoxFaceSpec = StageImageRef & {
  x: number
  y: number
  z: number
  yaw: number
}

/** Extra CSS plate. Named faces stay the kit; these are add/remove. */
export type BoxPlane = BoxFaceSpec & {
  id: string
  w: number
  h: number
}

export interface KindProps {
  interior?: InteriorKind
  size?: BoxSize
  skin?: BoxSkin
  box?: Partial<Record<BoxFace, BoxFaceSpec>>
  planes?: BoxPlane[]
  /** Gate / wormhole pair — entity id of the far hole. */
  destination?: string
  [key: string]: unknown
}

const ATLAS: StageImageRef = { builtin: 'atlas' }

const MIN_BOX_M = 0.5

/** Six hull faces + mid dividers from ``size`` inset by ``skin``. Proa at z=0. */
export function layoutBoxFaces(
  size: BoxSize = CONTAINER_SIZE,
  skin: BoxSkin = ZERO_SKIN,
): Record<BoxFace, Pick<BoxFaceSpec, 'x' | 'y' | 'z' | 'yaw'>> {
  const { h, d } = size
  const s = clampSkin(size, skin)
  const inner = innerBoxSize(size, s)
  const cx = (s.left - s.right) / 2
  const cy = s.floor + inner.h / 2
  const cz = s.front + inner.d / 2
  return {
    left: { x: -size.w / 2 + s.left, y: cy, z: cz, yaw: 90 },
    right: { x: size.w / 2 - s.right, y: cy, z: cz, yaw: -90 },
    floor: { x: cx, y: s.floor, z: cz, yaw: 0 },
    front: { x: cx, y: cy, z: s.front, yaw: 0 },
    back: { x: cx, y: cy, z: d - s.back, yaw: 180 },
    top: { x: cx, y: h - s.top, z: cz, yaw: 0 },
    divider_fore: { x: cx, y: cy, z: cz, yaw: 180 },
    divider_aft: { x: cx, y: cy, z: cz, yaw: 0 },
  }
}

function boxFromLayout(
  size: BoxSize,
  images?: Partial<Record<BoxFace, StageImageRef>>,
  skin: BoxSkin = ZERO_SKIN,
): Record<BoxFace, BoxFaceSpec> {
  const poses = layoutBoxFaces(size, skin)
  const out = {} as Record<BoxFace, BoxFaceSpec>
  for (const name of BOX_FACES) {
    out[name] = { ...(images?.[name] ?? ATLAS), ...poses[name] }
  }
  return out
}

/** Kind defaults: old nave atlas on the 5×10 cube. */
export const CONTAINER_BOX_DEFAULTS: KindProps = {
  interior: 'css3d',
  size: { ...CONTAINER_SIZE },
  skin: { ...ZERO_SKIN },
  box: boxFromLayout(CONTAINER_SIZE),
}

/** Face axis that owns a cube edge. Other xyz on that face are derived. */
export function sizeFromFaceAxis(
  face: BoxFace,
  axis: 'x' | 'y' | 'z',
  value: number,
  size: BoxSize,
): BoxSize {
  if (!Number.isFinite(value)) return size
  const next = { ...size }
  if ((face === 'left' || face === 'right') && axis === 'x') next.w = Math.max(MIN_BOX_M, Math.abs(value) * 2)
  else if (face === 'back' && axis === 'z') next.d = Math.max(MIN_BOX_M, value)
  else if (face === 'top' && axis === 'y') next.h = Math.max(MIN_BOX_M, value)
  return next
}

export function isBoxLayoutKey(key: string): boolean {
  return (
    /^props\.size\.[whd]$/.test(key)
    || /^props\.skin\.(left|right|floor|front|back|top)$/.test(key)
    || /^props\.box\.(left|right|floor|front|back|top|divider_fore|divider_aft)\.(x|y|z|yaw)$/.test(key)
  )
}

export function boxLayoutDraft(size: BoxSize, skin: BoxSkin = ZERO_SKIN): Record<string, string> {
  const s = clampSkin(size, skin)
  const poses = layoutBoxFaces(size, s)
  const out: Record<string, string> = {
    'props.size.w': String(size.w),
    'props.size.h': String(size.h),
    'props.size.d': String(size.d),
  }
  for (const name of HULL_FACES) {
    out[`props.skin.${name}`] = String(s[name])
  }
  for (const name of BOX_FACES) {
    const p = poses[name]
    out[`props.box.${name}.x`] = String(p.x)
    out[`props.box.${name}.y`] = String(p.y)
    out[`props.box.${name}.z`] = String(p.z)
    out[`props.box.${name}.yaw`] = String(p.yaw)
  }
  return out
}

export const BOX_FACE_LABELS: Record<BoxFace, string> = {
  left: 'Left',
  right: 'Right',
  floor: 'Floor',
  front: 'Front',
  back: 'Back',
  top: 'Top',
  divider_fore: 'Divider fore',
  divider_aft: 'Divider aft',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function usesContainerBox(namespace?: string | null, kindProps?: unknown): boolean {
  if (isRecord(kindProps) && isRecord(kindProps.box)) return true
  const ns = namespace || ''
  return ns.includes('.container.') || ns === 'entity.system.ship.home'
}

const BUILTIN_IMAGES = ['vista', 'port', 'atlas', 'ground'] as const

function asBuiltin(name: string): StageImageRef {
  return (BUILTIN_IMAGES as readonly string[]).includes(name)
    ? { builtin: name as (typeof BUILTIN_IMAGES)[number] }
    : { url: name }
}

export function parseImageRef(raw: string): StageImageRef | null {
  const s = raw.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('data:')) return { url: s }
  if ((BUILTIN_IMAGES as readonly string[]).includes(s)) return asBuiltin(s)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return { photoId: s }
  }
  return asBuiltin(s)
}

export function imageRefToWire(ref: StageImageRef | undefined | null): string {
  if (!ref) return ''
  if ('url' in ref && ref.url) return ref.url
  if ('photoId' in ref && ref.photoId) return ref.photoId
  if ('builtin' in ref && ref.builtin) return ref.builtin
  return ''
}

export function isAtlasRef(ref: StageImageRef | undefined | null): boolean {
  return !!ref && 'builtin' in ref && ref.builtin === 'atlas'
}

function asImageRef(raw: unknown): StageImageRef | undefined {
  if (!isRecord(raw)) return undefined
  if (typeof raw.url === 'string' && raw.url.trim()) return { url: raw.url.trim() }
  if (typeof raw.photoId === 'string' && raw.photoId.trim()) return { photoId: raw.photoId.trim() }
  if (typeof raw.photo_id === 'string' && raw.photo_id.trim()) return { photoId: raw.photo_id.trim() }
  if (typeof raw.builtin === 'string' && raw.builtin.trim()) return asBuiltin(raw.builtin.trim())
  if (isRecord(raw.image)) return asImageRef(raw.image)
  return undefined
}

export function parseMetres(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') return NaN
  const n = Number(raw.trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Inspector skin fields are mm. The bag stays metres. */
export function skinMetresToMmLabel(raw: unknown): string {
  const m = parseMetres(raw)
  if (!Number.isFinite(m) || m === 0) return '0'
  return String(Math.round(m * 1000))
}

export function skinMmInputToMetres(raw: unknown): number {
  const mm = parseMetres(raw)
  if (!Number.isFinite(mm) || mm <= 0) return 0
  return mm / 1000
}

function num(raw: unknown, fallback: number): number {
  const n = parseMetres(raw)
  return Number.isFinite(n) ? n : fallback
}

function parseSize(raw: unknown): BoxSize | undefined {
  if (!isRecord(raw)) return undefined
  const w = num(raw.w, NaN)
  const h = num(raw.h, NaN)
  const d = num(raw.d, NaN)
  if (![w, h, d].every(Number.isFinite)) return undefined
  return { w, h, d }
}

function parseSkin(raw: unknown): BoxSkin | undefined {
  if (!isRecord(raw)) return undefined
  const out: BoxSkin = { ...ZERO_SKIN }
  let any = false
  for (const face of HULL_FACES) {
    const n = parseMetres(raw[face])
    if (Number.isFinite(n)) {
      out[face] = Math.max(0, n)
      any = true
    }
  }
  return any ? out : undefined
}

type FacePatch = Partial<BoxFaceSpec>

function parseFacePatch(raw: unknown): FacePatch | undefined {
  if (!isRecord(raw)) return undefined
  const image = asImageRef(raw)
  const out: FacePatch = { ...image }
  let any = !!image
  for (const key of ['x', 'y', 'z', 'yaw'] as const) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) {
      out[key] = raw[key]
      any = true
    }
  }
  return any ? out : undefined
}

function imageOnly(spec: StageImageRef): StageImageRef {
  if ('url' in spec) return { url: spec.url }
  if ('photoId' in spec) return { photoId: spec.photoId }
  return { builtin: spec.builtin }
}

function completeFace(patch?: FacePatch, fallback?: BoxFaceSpec): BoxFaceSpec | undefined {
  const base = fallback
  if (!patch && !base) return undefined
  const src = base ?? { ...ATLAS, x: 0, y: 0, z: 0, yaw: 0 }
  const image =
    patch && ('url' in patch || 'photoId' in patch || 'builtin' in patch)
      ? imageOnly(patch as StageImageRef)
      : imageOnly(src)
  return {
    ...image,
    x: patch?.x ?? src.x,
    y: patch?.y ?? src.y,
    z: patch?.z ?? src.z,
    yaw: patch?.yaw ?? src.yaw,
  }
}

function parseKindProps(raw: unknown): KindProps {
  if (!isRecord(raw)) return {}
  const out: KindProps = {}
  if (raw.interior === 'css3d' || raw.interior === 'rendered') out.interior = raw.interior
  if (typeof raw.destination === 'string' && raw.destination.trim()) out.destination = raw.destination.trim()
  const size = parseSize(raw.size)
  if (size) out.size = size
  const skin = parseSkin(raw.skin)
  if (skin) out.skin = skin
  if (isRecord(raw.box)) {
    const box: Partial<Record<BoxFace, BoxFaceSpec>> = {}
    for (const name of BOX_FACES) {
      const spec = completeFace(parseFacePatch(raw.box[name]), CONTAINER_BOX_DEFAULTS.box?.[name])
      if (spec && parseFacePatch(raw.box[name])) box[name] = spec
    }
    if (Object.keys(box).length) out.box = box
  }
  const planes = parsePlanes(raw.planes)
  if (planes) out.planes = planes
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'interior' || key === 'box' || key === 'size' || key === 'skin' || key === 'planes') continue
    out[key] = value
  }
  return out
}

function mergeFaces(
  base?: Partial<Record<BoxFace, BoxFaceSpec>>,
  overlay?: Partial<Record<BoxFace, BoxFaceSpec>>,
): Partial<Record<BoxFace, BoxFaceSpec>> | undefined {
  if (!base && !overlay) return undefined
  const box: Partial<Record<BoxFace, BoxFaceSpec>> = {}
  for (const name of BOX_FACES) {
    const spec = completeFace(overlay?.[name], base?.[name] ?? CONTAINER_BOX_DEFAULTS.box?.[name])
    if (spec) box[name] = spec
  }
  return Object.keys(box).length ? box : undefined
}

function parsePlanes(raw: unknown): BoxPlane[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: BoxPlane[] = []
  for (const row of raw) {
    if (!isRecord(row) || typeof row.id !== 'string' || !row.id.trim()) continue
    const image = asImageRef(row) ?? ATLAS
    const w = num(row.w, CONTAINER_SIZE.w)
    const h = num(row.h, CONTAINER_SIZE.h)
    out.push({
      ...image,
      id: row.id.trim(),
      x: num(row.x, 0),
      y: num(row.y, CONTAINER_SIZE.h / 2),
      z: num(row.z, CONTAINER_SIZE.d / 2),
      yaw: num(row.yaw, 0),
      w,
      h,
    })
  }
  return out.length ? out : undefined
}

function relayoutBox(props: KindProps): KindProps {
  if (!props.box && !props.size && !props.skin) return props
  const size = props.size ?? CONTAINER_SIZE
  const skin = clampSkin(size, props.skin ?? ZERO_SKIN)
  const images: Partial<Record<BoxFace, StageImageRef>> = {}
  for (const name of BOX_FACES) {
    if (props.box?.[name]) images[name] = imageOnly(props.box[name]!)
  }
  return { ...props, size, skin, box: boxFromLayout(size, images, skin) }
}

function mergeDeep(base: KindProps, overlay: KindProps): KindProps {
  const box = mergeFaces(base.box, overlay.box)
  const planes = overlay.planes ?? base.planes
  return {
    ...base,
    ...overlay,
    ...(base.size || overlay.size
      ? { size: { ...(base.size ?? CONTAINER_SIZE), ...(overlay.size ?? {}) } }
      : {}),
    ...(base.skin || overlay.skin
      ? { skin: { ...ZERO_SKIN, ...(base.skin ?? {}), ...(overlay.skin ?? {}) } }
      : {}),
    ...(box ? { box } : {}),
    ...(planes ? { planes } : {}),
  }
}

/** Kind defaults ← entity overlay. Empty / image-only bags get the 5×10 poses. */
export function mergeKindProps(
  kindProps?: unknown,
  entityProps?: unknown,
  namespace?: string | null,
): KindProps {
  const parsedKind = parseKindProps(kindProps)
  const fallback = usesContainerBox(namespace, parsedKind) ? CONTAINER_BOX_DEFAULTS : {}
  const merged = mergeDeep(mergeDeep(fallback, parsedKind), parseKindProps(entityProps))
  return usesContainerBox(namespace, merged) ? relayoutBox(merged) : merged
}

export function boxFaceSize(
  face: BoxFace,
  size: BoxSize = CONTAINER_SIZE,
  skin: BoxSkin = ZERO_SKIN,
): { w: number; h: number } {
  const inner = innerBoxSize(size, skin)
  if (face === 'floor' || face === 'top') return { w: inner.w, h: inner.d }
  if (face === 'left' || face === 'right') return { w: inner.d, h: inner.h }
  return { w: inner.w, h: inner.h }
}
