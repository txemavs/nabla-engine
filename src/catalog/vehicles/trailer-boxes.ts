import type { Vec3Tuple } from '../../entity/schema.js'
import type { QuatTuple } from '../../math/frame/vectors.js'

const identity = {
  position: [0, 0, 0] as Vec3Tuple,
  rotation: [0, 0, 0, 1] as QuatTuple,
}

/** Swappable cargo body that sits on a trailer chassis. */
export interface TrailerBoxPreset {
  id: string
  label: string
  url: `/${string}.glb`
  transform: { position: Vec3Tuple; rotation: QuatTuple }
  /** Added to the bare-chassis mass when this box is attached. */
  mass: number
}

const boxes: readonly TrailerBoxPreset[] = [
  {
    id: 'white-box',
    label: 'Caja blanca',
    url: '/library/trucks/white-truck/assets/trailer.box.glb',
    transform: identity,
    mass: 2500,
  },
]

export function trailerBoxes(): readonly TrailerBoxPreset[] {
  return boxes
}

export function hasTrailerBox(id: string): boolean {
  return boxes.some((box) => box.id === id)
}

export function trailerBox(id: string): TrailerBoxPreset {
  const box = boxes.find((entry) => entry.id === id)
  if (!box) throw new Error(`No trailer box "${id}"`)
  return box
}
