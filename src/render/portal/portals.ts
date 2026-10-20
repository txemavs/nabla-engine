import * as THREE from 'three'
import type { Entity } from '../../entity/schema.js'
import { isWebGPU } from '../backend.js'
import { setWebGPUSubstitute, type NodeKit, type WebGPUSubstitute } from '../webgpu-substitutes.js'

export interface PortalSurface {
  entity: Entity
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  target: THREE.WebGLRenderTarget
}
export interface ExternalPortalView {
  destination: PortalSurface
  scene: THREE.Scene
  background: (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => void
}
export function createPortalSurface(entity: Entity): PortalSurface {
  const target = new THREE.WebGLRenderTarget(1, 1)
  const material = new THREE.ShaderMaterial({
    uniforms: { remote: { value: target.texture }, live: { value: 0 } },
    vertexShader: `
      varying vec4 screen;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        screen = gl_Position;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D remote;
      uniform float live;
      varying vec4 screen;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 uv = screen.xy / screen.w * 0.5 + 0.5;
        gl_FragColor = live > 0.5 ? texture2D(remote, uv) : vec4(0.0, 0.0, 0.0, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(entity.size[0], entity.size[1]), material)
  mesh.userData.portalSurface = true
  setWebGPUSubstitute(mesh, portalMaterial(material))
  return { entity, mesh, target }
}

/**
 * The portal shader as a node material: the remote capture at the fragment's screen position
 * (WebGPU's `screenUV` and render-target rows both run top-down), black while not live. The
 * capture is linear, so the frame's output pass tone-maps it as WebGL's `tonemapping_fragment`.
 */
function portalMaterial(base: THREE.ShaderMaterial) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const t = tsl as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const live = t.uniform(0).onRenderUpdate(() => base.uniforms.live.value)
    const remote = t.texture(base.uniforms.remote.value, t.screenUV)
    const material = new webgpu.MeshBasicNodeMaterial({ side: THREE.DoubleSide })
    material.colorNode = t.select(live.greaterThan(0.5), remote, t.vec4(0, 0, 0, 1))
    material.fog = false
    material.name = 'Portal surface (WebGPU)'
    return { material }
  }
}

const obliqueQ = new THREE.Vector4()
const obliqueClip = new THREE.Vector4()
const obliquePlane = new THREE.Plane()

/**
 * Clip `camera` at a world plane through its near plane (WebGPURenderer has no global
 * `clippingPlanes`): the oblique projection of `reflectWebGPU`, for [0, 1] clip depth.
 */
function clipNearPlane(camera: THREE.PerspectiveCamera, plane: THREE.Plane): void {
  obliquePlane.copy(plane).applyMatrix4(camera.matrixWorldInverse)
  const clip = obliqueClip.set(
    obliquePlane.normal.x,
    obliquePlane.normal.y,
    obliquePlane.normal.z,
    obliquePlane.constant,
  )
  const e = camera.projectionMatrix.elements
  obliqueQ.set(
    (Math.sign(clip.x) + e[8]) / e[0],
    (Math.sign(clip.y) + e[9]) / e[5],
    -1,
    (1 + e[10]) / e[14],
  )
  clip.multiplyScalar(1 / clip.dot(obliqueQ))
  e[2] = clip.x
  e[6] = clip.y
  e[10] = clip.z
  e[14] = clip.w
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
/** One remote level. Targets use screen projection, not a second quad perspective. */
export function renderPortals(
  surfaces: Map<string, PortalSurface>,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  background: (camera: THREE.PerspectiveCamera) => void | (() => void),
  externalViews?: Map<string, ExternalPortalView>,
): number {
  if (!surfaces.size) return 0
  const connected = [...surfaces.values()].some(
    (s) => s.entity.portal!.mode !== 'closed' && surfaces.has(s.entity.portal!.pairId ?? ''),
  )
  if (!connected && !externalViews?.size) {
    for (const surface of surfaces.values()) surface.mesh.material.uniforms.live.value = 0
    return 0
  }
  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
  const oldTarget = renderer.getRenderTarget(),
    oldClear = renderer.autoClear,
    oldClipping = renderer.clippingPlanes,
    oldShadowUpdate = renderer.shadowMap.autoUpdate
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const scale = Math.min(1, 1024 / Math.max(size.x, size.y))
  const remote = new THREE.PerspectiveCamera()
  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  )
  let rendered = 0
  const webgpu = isWebGPU(renderer)
  if (webgpu) {
    // The remote camera keeps the main projection, in the renderer's clip space.
    const system = (renderer as unknown as { coordinateSystem: THREE.CoordinateSystem })
      .coordinateSystem
    camera.coordinateSystem = system
    camera.updateProjectionMatrix()
  }
  try {
    // A recursion boundary has a stable dark surface rather than rendering stale feedback.
    for (const surface of surfaces.values()) surface.mesh.material.uniforms.live.value = 0
    renderer.shadowMap.autoUpdate = false
    for (const surface of surfaces.values()) {
      const external = externalViews?.get(surface.entity.id)
      const destination = external?.destination ?? surfaces.get(surface.entity.portal!.pairId ?? '')
      if (!destination || (!external && surface.entity.portal!.mode === 'closed')) continue
      const localEye = camera.position
        .clone()
        .applyMatrix4(surface.mesh.matrixWorld.clone().invert())
      if (localEye.z <= 0.015 || !frustum.intersectsObject(surface.mesh)) continue
      const mapping = destination.mesh.matrixWorld
        .clone()
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
        .multiply(surface.mesh.matrixWorld.clone().invert())
      remote.copy(camera)
      remote.matrixWorld.multiplyMatrices(mapping, camera.matrixWorld)
      remote.matrixWorld.decompose(remote.position, remote.quaternion, remote.scale)
      remote.updateMatrixWorld(true)
      surface.target.setSize(
        Math.max(1, Math.round(size.x * scale)),
        Math.max(1, Math.round(size.y * scale)),
      )
      renderer.setRenderTarget(surface.target)
      renderer.autoClear = true
      renderer.clippingPlanes = []
      let restoreEnvironment: void | (() => void) = undefined
      const wasVisible = destination.mesh.visible
      try {
        if (external) external.background(renderer, remote)
        else restoreEnvironment = background(remote)
        renderer.clearDepth()
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(destination.mesh.matrixWorld)
        const point = new THREE.Vector3()
          .setFromMatrixPosition(destination.mesh.matrixWorld)
          .addScaledVector(normal, 0.015)
        const clipPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point)
        if (webgpu) clipNearPlane(remote, clipPlane)
        else renderer.clippingPlanes = [clipPlane]
        destination.mesh.visible = false
        renderer.render(external?.scene ?? scene, remote)
        rendered++
      } finally {
        destination.mesh.visible = wasVisible
        restoreEnvironment?.()
      }
    }
    for (const surface of surfaces.values()) {
      const localEye = camera.position
        .clone()
        .applyMatrix4(surface.mesh.matrixWorld.clone().invert())
      surface.mesh.material.uniforms.live.value =
        (surface.entity.portal!.mode !== 'closed' || externalViews?.has(surface.entity.id)) &&
        localEye.z > 0.015 &&
        (surfaces.has(surface.entity.portal!.pairId ?? '') || externalViews?.has(surface.entity.id))
          ? 1
          : 0
    }
  } finally {
    renderer.setRenderTarget(oldTarget)
    renderer.autoClear = oldClear
    renderer.clippingPlanes = oldClipping
    renderer.shadowMap.autoUpdate = oldShadowUpdate
  }
  return rendered
}
