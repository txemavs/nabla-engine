import * as THREE from 'three'
import type { Entity } from '../src/scene.js'

export interface PortalSurface {
  entity: Entity
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  target: THREE.WebGLRenderTarget
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
  return { entity, mesh, target }
}
/** One remote level. Targets use screen projection, not a second quad perspective. */
export function renderPortals(
  surfaces: Map<string, PortalSurface>,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  background: (camera: THREE.PerspectiveCamera) => void | (() => void),
): void {
  if (!surfaces.size) return
  const connected = [...surfaces.values()].some(
    (s) => s.entity.portal!.mode !== 'closed' && surfaces.has(s.entity.portal!.pairId ?? ''),
  )
  if (!connected) {
    for (const surface of surfaces.values()) surface.mesh.material.uniforms.live.value = 0
    return
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
  try {
    // A recursion boundary has a stable dark surface rather than rendering stale feedback.
    for (const surface of surfaces.values()) surface.mesh.material.uniforms.live.value = 0
    renderer.shadowMap.autoUpdate = false
    for (const surface of surfaces.values()) {
      const destination = surfaces.get(surface.entity.portal!.pairId ?? '')
      if (!destination || surface.entity.portal!.mode === 'closed') continue
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
        restoreEnvironment = background(remote)
        renderer.clearDepth()
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(destination.mesh.matrixWorld)
        const point = new THREE.Vector3()
          .setFromMatrixPosition(destination.mesh.matrixWorld)
          .addScaledVector(normal, 0.015)
        renderer.clippingPlanes = [new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point)]
        destination.mesh.visible = false
        renderer.render(scene, remote)
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
        surface.entity.portal!.mode !== 'closed' &&
        localEye.z > 0.015 &&
        surfaces.has(surface.entity.portal!.pairId ?? '')
          ? 1
          : 0
    }
  } finally {
    renderer.setRenderTarget(oldTarget)
    renderer.autoClear = oldClear
    renderer.clippingPlanes = oldClipping
    renderer.shadowMap.autoUpdate = oldShadowUpdate
  }
}
