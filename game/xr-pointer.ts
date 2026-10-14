import * as THREE from 'three'

export interface QuestTarget {
  root: THREE.Object3D
  label: string
}

/** A visible blocker stops selection, even when the selectable object is behind it. */
export function pickQuestTarget(
  ray: THREE.Raycaster,
  targets: readonly QuestTarget[],
  blockers: readonly THREE.Object3D[],
): { target: QuestTarget; point: THREE.Vector3; distance: number } | null {
  const hit = ray
    .intersectObjects([...targets.map((t) => t.root), ...blockers], true)
    .find((intersection) => {
      for (let node: THREE.Object3D | null = intersection.object; node; node = node.parent)
        if (!node.visible) return false
      return true
    })
  if (!hit) return null
  for (const target of targets) {
    for (let node: THREE.Object3D | null = hit.object; node; node = node.parent)
      if (node === target.root) return { target, point: hit.point, distance: hit.distance }
  }
  return null
}

/** Never assign a weapon by controller index; connection order changes between sessions. */
export function questHand(
  source: Pick<XRInputSource, 'handedness' | 'targetRayMode' | 'hand'>,
): 'left' | 'right' | null {
  if (source.targetRayMode !== 'tracked-pointer' || source.hand) return null
  return source.handedness === 'left' || source.handedness === 'right' ? source.handedness : null
}
