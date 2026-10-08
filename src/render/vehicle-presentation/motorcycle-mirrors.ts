import { Mesh, MeshStandardMaterial, type Object3D } from 'three'

/** GLB parts (`extras.nabla.part`) that hold a motorcycle's rear-view mirrors, by side. */
export const motorcycleMirrorParts = Object.freeze({ mirror_L: 'left', mirror_R: 'right' } as const)

const partOf = (object: Object3D): unknown =>
  (object.userData as { nabla?: { part?: unknown } }).nabla?.part

const isGlass = (material: unknown): boolean =>
  material instanceof MeshStandardMaterial &&
  (/reflector|mirror glass/i.test(material.name) || material.metalness >= 0.9)

/**
 * The mirror glass of a motorcycle model: the reflective meshes under its `mirror_L` / `mirror_R`
 * parts, each tagged with its side (`userData.nabla.mirror`), so `CarMirrors` turns them into
 * the same live, adjustable reflections the cars use (and the «Espejos» sliders reach them).
 * Housings stay as they are. Empty when the model has no such parts.
 */
export function motorcycleMirrorLenses(model: Object3D): Mesh[] {
  const lenses: Mesh[] = []
  model.traverse((part) => {
    const name = partOf(part)
    if (typeof name !== 'string' || !(name in motorcycleMirrorParts)) return
    const side = motorcycleMirrorParts[name as keyof typeof motorcycleMirrorParts]
    part.traverse((node) => {
      if (!(node instanceof Mesh) || Array.isArray(node.material) || !isGlass(node.material)) return
      node.userData.nabla = { ...(node.userData.nabla as object | undefined), mirror: side }
      lenses.push(node)
    })
  })
  return lenses
}
