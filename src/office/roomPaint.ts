/**
 * Stage paint — the authored JSON for one room's scenery.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/kind/roomPaint.ts
 *
 * Types:
 *   RoomPaint     what the API stores (hull, seat, glass, screens, …)
 *   OfficeWorld   derived numbers the CSS/GL renderers already eat
 *   HELM_PAINT    shipped default (widthVw 300 = room is 3 helm-widths)
 */
import {
  CONSOLE_RX,
  CONSOLE_Z,
  DECK_Y,
  SCREEN_BASE_Y,
  defaultEyeY,
} from '../world.js'
import type { SkinFace } from '../skin/roomSkin.js'
import type { StageImageRef } from '../kind/types.js'

export type { SkinFace }

export type RoomPaintRgb = [number, number, number]

/** World floor photo. `width` / `height` are millimetres, not pixels. */
export interface RoomGround {
  image: StageImageRef
  x: number
  z: number
  width: number
  height: number
  /** Operator yaw (deg). Spins the map around the helm origin. */
  yaw?: number
  /** Ship height AGL as a drop of the photo (mm). Derived, not authored. */
  altMm?: number
}

/** Thing in the Room — metres, Y up, yaw around vertical. */
export interface RoomEntity {
  id: string
  name?: string
  parent_id?: string | null
  kind_namespace?: string
  capabilities?: string[]
  adapter?: string
  pads?: string[]
  tools?: string[]
  mesh: { builtin?: string; url?: string; hi_res?: string; low_res?: string }
  pose: {
    x: number
    y: number
    z: number
    yaw: number
    pitch?: number
    roll?: number
    qx?: number
    qy?: number
    qz?: number
    qw?: number
    scale?: number
  }
  cabin?: { x: number; y: number; z: number }
  paint?: RoomPaintRgb
  portals?: Array<{
    face: '+x' | '-x' | '+y' | '-y' | '+z' | '-z'
    id?: string
    pairId?: string
    arrive?: 'sit' | 'walk'
    toward?: 'in' | 'out'
  }>
}

export interface RoomPaint {
  hull: { widthVw: number; depth: number; ceilY: number; floorY: number }
  seat: { y: number; z: number; rx: number }
  crouchY: number
  glass: { y: number; z: number; rx: number }
  deck: { y: number; z: number; rx: number }
  perspective: number
  screens: { left: number; center: number; right: number }
  port: { z: number; image: StageImageRef }
  vista: {
    z: number
    scale: number
    fit: 'cover' | 'fill'
    anchor: { x: number; y: number }
    image: StageImageRef
  }
  skins: {
    atlas: StageImageRef
    pack: 'phi-net'
    turns: Partial<Record<SkinFace, 90 | -90>>
  }
  ground: RoomGround
  entities: RoomEntity[]
}

/** World numbers the office renderer already understands. */
export interface OfficeWorld {
  eyeY: number
  seatZ: number
  seatRx: number
  glassY: number
  glassZ: number
  glassRx: number
  skyZ: number
  vistaZ: number
  vistaScale: number
  skyY: number
  skyH: number
  ceilY: number
  floorY: number
  floorNearZ: number
  floorFarZ: number
  wallH: number
  roomHalfVw: number
  consoleY: number
  consoleZ: number
  consoleRx: number
  crouchY: number
}

/** Authored ground + operator nudge — area in m². */
export const GROUND_AREA_M2 = 36000
export const GROUND_SIDE_MM = Math.round(Math.sqrt(GROUND_AREA_M2) * 1000)
export const GROUND_HEIGHT_MM = Math.round((GROUND_SIDE_MM * 682) / 1024)
export const GROUND_ART_CX = 511.5
export const GROUND_ART_CY = 329.5
export const GROUND_CENTER_X_MM = Math.round((0.5 - GROUND_ART_CX / 1024) * GROUND_SIDE_MM)
export const GROUND_CENTER_Z_MM = Math.round((0.5 - GROUND_ART_CY / 682) * GROUND_HEIGHT_MM)

export const HELM_PAINT: RoomPaint = {
  hull: { widthVw: 300, depth: 9400, ceilY: -3192, floorY: 0 },
  seat: { y: defaultEyeY(), z: 72, rx: 0 },
  crouchY: 350,
  glass: { y: SCREEN_BASE_Y, z: 0, rx: 0 },
  deck: { y: DECK_Y, z: CONSOLE_Z, rx: CONSOLE_RX },
  perspective: 1200,
  screens: { left: 0, center: 0, right: 0 },
  port: { z: 0, image: { builtin: 'port' } },
  vista: {
    z: -14000,
    scale: 24,
    fit: 'cover',
    anchor: { x: 50, y: 40 },
    image: { builtin: 'vista' },
  },
  skins: {
    atlas: { builtin: 'atlas' },
    pack: 'phi-net',
    turns: { floor: 90, back: 90, top: 90 },
  },
  ground: {
    image: { builtin: 'ground' },
    x: GROUND_CENTER_X_MM,
    z: GROUND_CENTER_Z_MM,
    width: GROUND_SIDE_MM,
    height: GROUND_HEIGHT_MM,
  },
  entities: [],
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function imageRef(raw: unknown, fallback: StageImageRef): StageImageRef {
  if (!raw || typeof raw !== 'object') return fallback
  const o = raw as Record<string, unknown>
  if (o.builtin === 'vista' || o.builtin === 'port' || o.builtin === 'atlas' || o.builtin === 'ground') {
    return { builtin: o.builtin }
  }
  if (typeof o.photoId === 'string' && o.photoId.trim()) return { photoId: o.photoId.trim() }
  if (typeof o.url === 'string' && o.url.trim()) return { url: o.url.trim() }
  return fallback
}

/** Old paint stored wing yaw 70°. Those numbers are now mm of slide. */
function parsePaintScreens(raw: Record<string, unknown>): RoomPaint['screens'] {
  const left = num(raw.left, HELM_PAINT.screens.left)
  const center = num(raw.center, HELM_PAINT.screens.center)
  const right = num(raw.right, HELM_PAINT.screens.right)
  const yaw = (n: number) => n >= 0 && n <= 90 && n % 5 === 0
  if (yaw(left) && yaw(right) && yaw(center) && (left === 70 || right === 70)) {
    return { left: 0, center: 0, right: 0 }
  }
  return { left, center, right }
}

export function parseRoomPaint(raw: unknown): RoomPaint {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const hull = o.hull && typeof o.hull === 'object' ? (o.hull as Record<string, unknown>) : {}
  const seat = o.seat && typeof o.seat === 'object' ? (o.seat as Record<string, unknown>) : {}
  const glass = o.glass && typeof o.glass === 'object' ? (o.glass as Record<string, unknown>) : {}
  const deck = o.deck && typeof o.deck === 'object' ? (o.deck as Record<string, unknown>) : {}
  const screens = o.screens && typeof o.screens === 'object' ? (o.screens as Record<string, unknown>) : {}
  const port = o.port && typeof o.port === 'object' ? (o.port as Record<string, unknown>) : {}
  const vista = o.vista && typeof o.vista === 'object' ? (o.vista as Record<string, unknown>) : {}
  const skins = o.skins && typeof o.skins === 'object' ? (o.skins as Record<string, unknown>) : {}
  const ground = o.ground && typeof o.ground === 'object' ? (o.ground as Record<string, unknown>) : {}
  const anchor = vista.anchor && typeof vista.anchor === 'object' ? (vista.anchor as Record<string, unknown>) : {}
  const turns = skins.turns && typeof skins.turns === 'object' ? (skins.turns as Record<string, unknown>) : {}
  const parsedTurns: Partial<Record<SkinFace, 90 | -90>> = { ...HELM_PAINT.skins.turns }
  for (const face of Object.keys(turns) as SkinFace[]) {
    if (turns[face] === 90 || turns[face] === -90) parsedTurns[face] = turns[face] as 90 | -90
  }
  const parsed: RoomPaint = {
    hull: {
      widthVw: num(hull.widthVw, HELM_PAINT.hull.widthVw),
      depth: num(hull.depth, HELM_PAINT.hull.depth),
      ceilY: num(hull.ceilY, HELM_PAINT.hull.ceilY),
      floorY: num(hull.floorY, HELM_PAINT.hull.floorY),
    },
    seat: {
      y: num(seat.y, HELM_PAINT.seat.y),
      z: num(seat.z, HELM_PAINT.seat.z),
      rx: num(seat.rx, HELM_PAINT.seat.rx),
    },
    crouchY: num(o.crouchY, HELM_PAINT.crouchY),
    glass: {
      y: num(glass.y, HELM_PAINT.glass.y),
      z: num(glass.z, HELM_PAINT.glass.z),
      rx: num(glass.rx, HELM_PAINT.glass.rx),
    },
    deck: {
      y: num(deck.y, HELM_PAINT.deck.y),
      z: num(deck.z, HELM_PAINT.deck.z),
      rx: num(deck.rx, HELM_PAINT.deck.rx),
    },
    perspective: num(o.perspective, HELM_PAINT.perspective),
    screens: parsePaintScreens(screens),
    port: {
      z: num(port.z, HELM_PAINT.port.z),
      image: imageRef(port.image, HELM_PAINT.port.image),
    },
    vista: {
      z: num(vista.z, HELM_PAINT.vista.z),
      scale: num(vista.scale, HELM_PAINT.vista.scale),
      fit: vista.fit === 'fill' ? 'fill' : 'cover',
      anchor: {
        x: num(anchor.x, HELM_PAINT.vista.anchor.x),
        y: num(anchor.y, HELM_PAINT.vista.anchor.y),
      },
      image: imageRef(vista.image, HELM_PAINT.vista.image),
    },
    skins: {
      atlas: imageRef(skins.atlas, HELM_PAINT.skins.atlas),
      pack: 'phi-net',
      turns: parsedTurns,
    },
    ground: {
      image: imageRef(ground.image, HELM_PAINT.ground.image),
      x: num(ground.x, HELM_PAINT.ground.x),
      z: num(ground.z, HELM_PAINT.ground.z),
      width: Math.max(1, num(ground.width, HELM_PAINT.ground.width)),
      height: Math.max(1, num(ground.height, HELM_PAINT.ground.height)),
    },
    entities: Array.isArray(o.entities) ? (o.entities as RoomEntity[]) : [],
  }
  return remapLegacyOrigin(parsed)
}

/** Pre-mm helm (floor at +680, glass at 0) → floor at 0, glass at −900. */
function remapLegacyOrigin(paint: RoomPaint): RoomPaint {
  const legacy =
    paint.hull.floorY === 680
    && paint.glass.y === 0
    && paint.seat.y === -400
    && paint.deck.y === 68
  if (!legacy) return paint
  const wallH = paint.hull.floorY - paint.hull.ceilY
  return {
    ...paint,
    hull: { ...paint.hull, floorY: 0, ceilY: -wallH },
    glass: { ...paint.glass, y: SCREEN_BASE_Y },
    deck: { ...paint.deck, y: DECK_Y },
    seat: { ...paint.seat, y: defaultEyeY() },
    crouchY: paint.crouchY === 56 ? 350 : paint.crouchY,
  }
}

export function deriveOffice(paint: RoomPaint): OfficeWorld {
  const ceilY = paint.hull.ceilY
  const floorY = paint.hull.floorY
  const wallH = floorY - ceilY
  const portZ = paint.port.z
  return {
    eyeY: paint.seat.y,
    seatZ: paint.seat.z,
    seatRx: paint.seat.rx,
    glassY: paint.glass.y,
    glassZ: paint.glass.z,
    glassRx: paint.glass.rx,
    skyZ: portZ,
    vistaZ: paint.vista.z,
    vistaScale: paint.vista.scale,
    skyY: ceilY,
    skyH: wallH,
    ceilY,
    floorY,
    floorNearZ: portZ + paint.hull.depth,
    floorFarZ: portZ,
    wallH,
    roomHalfVw: paint.hull.widthVw / 2,
    consoleY: paint.deck.y,
    consoleZ: paint.deck.z,
    consoleRx: paint.deck.rx,
    crouchY: paint.crouchY,
  }
}

export function clonePaint(paint: RoomPaint = HELM_PAINT): RoomPaint {
  return parseRoomPaint(JSON.parse(JSON.stringify(paint)))
}

/** World map on the floor. Image top = −Z. */
export function groundWorldMm(g: RoomGround): { w: number; h: number } {
  return { w: g.width, h: g.height }
}
