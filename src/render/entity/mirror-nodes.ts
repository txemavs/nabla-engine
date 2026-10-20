import * as THREE from 'three'
import type { Reflector } from 'three/addons/objects/Reflector.js'
import type { NodeKit, WebGPUSubstitute } from '../webgpu-substitutes.js'

// TSL's generics cannot follow these node graphs; they are typed loosely inside this file.
type N = any // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The `Reflector` shader as a node material: the capture sampled through `textureMatrix`
 * (projective), overlay-blended with the mirror colour, tone-mapped like any lit output.
 */
export function reflectorMaterial(mirror: Reflector) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as N
    const base = mirror.material as THREE.ShaderMaterial
    const color = t.uniform(base.uniforms.color.value)
    const matrix = t.uniform(base.uniforms.textureMatrix.value)
    const material = new webgpu.MeshBasicNodeMaterial()
    const projected = t.varying(matrix.mul(t.vec4(t.positionLocal, 1)))
    // Render-target rows run top-down under WebGPU: flip the projected v.
    const uv = t.vec2(projected.x.div(projected.w), projected.y.div(projected.w).oneMinus())
    const sample = t.texture(mirror.getRenderTarget().texture, uv).rgb
    // blendOverlay(base, blend): mix(2·base·blend, 1 − 2(1 − base)(1 − blend), step(0.5, base)).
    const low = sample.mul(color).mul(2)
    const high = t.vec3(1).sub(sample.oneMinus().mul(color.oneMinus()).mul(2))
    material.colorNode = t.mix(low, high, t.step(0.5, sample))
    material.fog = false
    material.name = 'Reflector (WebGPU)'
    return { material }
  }
}

const reflectorPosition = new THREE.Vector3()
const cameraPosition = new THREE.Vector3()
const rotation = new THREE.Matrix4()
const normal = new THREE.Vector3()
const view = new THREE.Vector3()
const lookAt = new THREE.Vector3()
const target = new THREE.Vector3()
const plane = new THREE.Plane()
const clip = new THREE.Vector4()
const q = new THREE.Vector4()
const virtual = new WeakMap<Reflector, THREE.PerspectiveCamera>()

/**
 * `Reflector.onBeforeRender` for a WebGPU renderer: the same mirrored camera, texture matrix and
 * oblique near plane, with the near plane written for WebGPU's [0, 1] clip depth (as three's
 * `ReflectorNode` does) and without the WebGL state calls. Renders into the reflector's target.
 */
export function reflectWebGPU(
  mirror: Reflector,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  clipBias: number,
): void {
  let reflection = virtual.get(mirror)
  if (!reflection) {
    reflection = new THREE.PerspectiveCamera()
    virtual.set(mirror, reflection)
  }
  reflectorPosition.setFromMatrixPosition(mirror.matrixWorld)
  cameraPosition.setFromMatrixPosition(camera.matrixWorld)
  rotation.extractRotation(mirror.matrixWorld)
  normal.set(0, 0, 1).applyMatrix4(rotation)
  view.subVectors(reflectorPosition, cameraPosition)
  if (view.dot(normal) > 0) return
  view.reflect(normal).negate().add(reflectorPosition)
  rotation.extractRotation(camera.matrixWorld)
  lookAt.set(0, 0, -1).applyMatrix4(rotation).add(cameraPosition)
  target.subVectors(reflectorPosition, lookAt).reflect(normal).negate().add(reflectorPosition)
  reflection.position.copy(view)
  reflection.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal)
  reflection.lookAt(target)
  reflection.far = camera.far
  reflection.updateMatrixWorld()
  // The capture camera's projection, in the renderer's clip space.
  const system = (renderer as unknown as { coordinateSystem: THREE.CoordinateSystem })
    .coordinateSystem
  camera.coordinateSystem = system
  camera.updateProjectionMatrix()
  reflection.coordinateSystem = system
  reflection.projectionMatrix.copy(camera.projectionMatrix)
  reflection.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
  const material = mirror.material as THREE.ShaderMaterial
  ;(material.uniforms.textureMatrix.value as THREE.Matrix4)
    .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    .multiply(reflection.projectionMatrix)
    .multiply(reflection.matrixWorldInverse)
    .multiply(mirror.matrixWorld)
  plane.setFromNormalAndCoplanarPoint(normal, reflectorPosition)
  plane.applyMatrix4(reflection.matrixWorldInverse)
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant)
  const e = reflection.projectionMatrix.elements
  q.set(
    (Math.sign(clip.x) + e[8]) / e[0],
    (Math.sign(clip.y) + e[9]) / e[5],
    -1,
    (1 + e[10]) / e[14],
  )
  clip.multiplyScalar(1 / clip.dot(q))
  e[2] = clip.x
  e[6] = clip.y
  e[10] = clip.z - clipBias
  e[14] = clip.w
  reflection.projectionMatrixInverse.copy(reflection.projectionMatrix).invert()
  mirror.visible = false
  const current = renderer.getRenderTarget()
  const shadows = renderer.shadowMap.autoUpdate
  renderer.shadowMap.autoUpdate = false
  renderer.setRenderTarget(mirror.getRenderTarget())
  if (renderer.autoClear === false) renderer.clear()
  renderer.render(scene, reflection)
  renderer.shadowMap.autoUpdate = shadows
  renderer.setRenderTarget(current)
  mirror.visible = true
}
