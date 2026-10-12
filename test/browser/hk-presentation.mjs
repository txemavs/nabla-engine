// Artistic poses shared by manual and animated review; no mesh deformation.
export function magazineRoundsForPreview(state, capacity, detached) {
  return state.reload === 'magazine-in'
    ? (state.pendingMagazine?.rounds ?? 0)
    : state.magazineSeated
      ? state.magazine
      : detached
}
export function barrelPose(slide) {
  const t = Math.max(0, Math.min(1, slide * 5)),
    blend = t * t * (3 - 2 * t)
  const angle = 0.0175 * blend,
    y = 0.113392,
    z = -0.11
  return {
    angle,
    position: [
      0,
      y - (y * Math.cos(angle) - z * Math.sin(angle)) - 0.00125 * blend,
      z - (y * Math.sin(angle) + z * Math.cos(angle)) + 0.003 * blend,
    ],
  }
}
export function applyReviewedPose(world, travel, triggerAction) {
  const slide = world.getObjectByName('Slide'),
    barrel = world.getObjectByName('Barrel')
  if (slide && barrel) {
    const p = barrelPose(slide.position.z / travel)
    barrel.rotation.x = p.angle
    barrel.position.fromArray(p.position)
  }
  const hammer = world.getObjectByName('HammerPivot')
  if (hammer) hammer.rotation.x = triggerAction === 'single' ? 0.7 : 0
  // This asset retains the author's hammer; there is no alternate DAO mesh.
  const visibleHammer = world.getObjectByName('Hammer')
  if (visibleHammer) visibleHammer.visible = true
}
