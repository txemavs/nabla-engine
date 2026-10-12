import type { Object3D } from 'three'

/** Artistic extended magazine: retain the mouth and cartridge, extend the body below it. */
export function poseMagazineCapacity(magazine: Object3D, capacity: number): void {
  const factor = capacity > 13 ? 1.75 : 1
  for (const body of magazine.children) {
    if (body.name === 'MagazineTopRound') continue
    const rest = (body.userData.magazineShapeRest ??= {
      y: body.position.y,
      scaleY: body.scale.y,
    })
    body.scale.y = rest.scaleY * factor
    body.position.y = 0.0657 + (rest.y - 0.0657) * factor
  }
}
