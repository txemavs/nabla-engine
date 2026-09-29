import {
  CircleGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  RGBADepthPacking,
  type MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { PlanetPayload } from '../../planet/index.js'

/** Both foliage cards must have the authored crown width, including the Z-facing card. */
export function treeInstances(
  vegetation: PlanetPayload['vegetation'],
  material: Material,
): InstancedMesh {
  const a = new PlaneGeometry(1, 1),
    b = new PlaneGeometry(1, 1)
  b.rotateY(Math.PI / 2)
  // A twelve-sided horizontal crown fills the cross from above. Reuse the
  // upper foliage region of the same texture, excluding the bare trunk.
  const crown = new CircleGeometry((0.46 * 2) / 3, 12)
  const uv = crown.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.08 + uv.getX(i) * 0.4, 0.45 + uv.getY(i) * 0.4)
  crown.rotateX(-Math.PI / 2)
  for (const plane of [a, b])
    plane.setAttribute(
      'crownCard',
      new Float32BufferAttribute(new Float32Array(plane.getAttribute('position').count), 1),
    )
  crown.setAttribute(
    'crownCard',
    new Float32BufferAttribute(new Float32Array(crown.getAttribute('position').count).fill(1), 1),
  )
  // Keep the one material/one instanced draw, but hide the horizontal card
  // at grazing angles. Camera direction is evaluated per rendering pass.
  // Apply the same height correction in colour and shadow passes. The instance
  // matrix already contains tree height, so no per-tree buffers or updates are needed.
  const patchMaterial = (material: Material) => {
    const originalCompile = material.onBeforeCompile
    const originalKey = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      originalCompile.call(material, shader, renderer)
      shader.vertexShader =
        'attribute float crownCard; varying float crownVisibility;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float treeHeight = max(length(instanceMatrix[1].xyz), 0.001);
      transformed.y += crownCard * (min(2.5, treeHeight * 0.5) / treeHeight - 0.5);
      #endif`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
      float facing = abs(dot(normalize(mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0)), normalize(-mvPosition.xyz)));
      crownVisibility = mix(1.0, smoothstep(0.18, 0.5, facing), crownCard);`,
      )
      shader.fragmentShader = 'varying float crownVisibility;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        'diffuseColor.a *= crownVisibility;\n#include <alphatest_fragment>',
      )
    }
    material.customProgramCacheKey = () => originalKey + '-horizontal-crown-v2'
    material.needsUpdate = true
  }
  patchMaterial(material)
  const foliage = material as MeshStandardMaterial
  const shadowOptions = { map: foliage.map, alphaTest: material.alphaTest, side: material.side }
  const depth = new MeshDepthMaterial({ ...shadowOptions, depthPacking: RGBADepthPacking })
  const distance = new MeshDistanceMaterial(shadowOptions)
  patchMaterial(depth)
  patchMaterial(distance)
  material.addEventListener('dispose', () => {
    depth.dispose()
    distance.dispose()
  })
  const geometry = mergeGeometries([a, b, crown])
  a.dispose()
  b.dispose()
  crown.dispose()
  const trees = new InstancedMesh(geometry, material, vegetation.length)
  const matrix = new Matrix4(),
    rotation = new Quaternion()
  vegetation.forEach((tree, i) => {
    const [width, height] = tree.size
    matrix.compose(
      new Vector3(tree.position[0], tree.position[1] + height / 2, tree.position[2]),
      rotation,
      new Vector3(width, height, width),
    )
    trees.setMatrixAt(i, matrix)
  })
  trees.customDepthMaterial = depth
  trees.customDistanceMaterial = distance
  trees.castShadow = true
  // Intersecting cutouts are an impostor, not a closed canopy: self-shadowing
  // exposes their cross-shaped construction as dark stripes inside the crown.
  trees.receiveShadow = false
  trees.userData.category = 'Trees'
  return trees
}
