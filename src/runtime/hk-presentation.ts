import * as T from 'three'

/** Cosmetic poses for the reviewed asset; offsets are local to its authored mesh. */
export function poseHKDetails(root: T.Object3D, slide: number, rounds: number): void {
  const barrel = root.getObjectByName('Barrel')
  if (barrel) {
    const t = T.MathUtils.clamp(slide * 5, 0, 1),
      blend = t * t * (3 - 2 * t)
    const pivot = new T.Vector3(0.0000705, 0.113392, -0.11)
    barrel.rotation.x = 0.0175 * blend
    barrel.position
      .copy(pivot)
      .sub(pivot.clone().applyAxisAngle(new T.Vector3(1, 0, 0), barrel.rotation.x))
    barrel.position.y -= 0.00125 * blend
    barrel.position.z += 0.003 * blend
  }
  const magazine = root.getObjectByName('Magazine'),
    source = root.getObjectByName('ChamberRound')
  if (!magazine || !source) return
  let top = magazine.getObjectByName('MagazineTopRound')
  if (!top) {
    top = source.clone(true)
    top.name = 'MagazineTopRound'
    top.rotation.x = -0.08
    const origin = new T.Vector3(0.0000705, 0.113392, -0.001)
    top.position
      .set(0.00061, 0.0657, 0.0128)
      .sub(origin.applyAxisAngle(new T.Vector3(1, 0, 0), top.rotation.x))
    magazine.add(top)
  }
  top.visible = rounds > 0
}
