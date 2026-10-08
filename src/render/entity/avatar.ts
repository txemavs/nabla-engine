import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { MonitorFace, MONITOR_COLUMNS, MONITOR_ROWS } from './monitor-face.js'

const monitors = new WeakMap<
  THREE.Group,
  {
    face: MonitorFace
    shades: THREE.Group
    target: number
    screen: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
    matrixMode: { value: number }
    tint: THREE.MeshPhysicalMaterial
    shell: THREE.MeshPhysicalMaterial
  }
>()

const HEAD_RADIUS = 0.18
const VISOR_TRAVEL = 1.4
const FACE_CENTRE_Y = 0.015

/** Spherical patch with continuous UVs; the border softly rounds towards each side. */
function curvedScreen(width: number, height: number, radius: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 80, 24)
  geometry.rotateY(Math.PI)
  const positions = geometry.getAttribute('position')
  const uvs = geometry.getAttribute('uv')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const edge = Math.abs(x) / (width / 2)
    const y = positions.getY(i) * Math.sqrt(Math.max(0.015, 1 - edge ** 8)) + FACE_CENTRE_Y
    const z = -Math.sqrt(Math.max(0.00001, HEAD_RADIUS ** 2 - x * x - y * y))
    const scale = radius / Math.hypot(x, y, z)
    positions.setXYZ(i, x * scale, y * scale, z * scale)
    // Extend the black display without stretching or relocating the existing face.
    const faceEdge = Math.abs(x) / (0.282 / 2)
    const faceRound = Math.sqrt(Math.max(0.015, 1 - faceEdge ** 8))
    uvs.setXY(i, 0.5 - x / 0.282, 0.5 + (y - FACE_CENTRE_Y) / (0.124 * faceRound))
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Floating helmet-monitor: spherical satin plastic, a discreet lower lip, a sliding visor and an original blue pixel face. */
export function createMonitorAvatar(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'FlyingMonitor'
  root.userData.avatar = {
    kind: 'flying-monitor',
    face: [80, 24],
    forward: '-Z',
    visibleBody: false,
  }
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0x080b10,
    metalness: 0,
    roughness: 0.58,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
  })

  const add = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    parent: THREE.Group = root,
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const body = new THREE.SphereGeometry(HEAD_RADIUS, 80, 56, 0, Math.PI * 2, 0, 2.3)
  add('Housing', body, shell, [0, 0, 0])
  // Open the shell over the display so it sits inside the sphere, rather than on top.
  shell.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 monitorShellPosition;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nmonitorShellPosition = position;',
    )
    shader.fragmentShader = 'varying vec3 monitorShellPosition;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `
      #include <clipping_planes_fragment>
      float edge = abs(monitorShellPosition.x) / 0.155;
      float borderY = 0.08 * sqrt(max(0.015, 1.0 - pow(edge, 8.0)));
      if (abs(monitorShellPosition.x) > 0.16 && length(monitorShellPosition.yz) < 0.041) discard;
      if (monitorShellPosition.z < 0.0 && edge < 1.0 && monitorShellPosition.y > 0.015 - borderY && monitorShellPosition.y < 0.0175 + 0.5 * borderY) discard;
    `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      // Broad tonal panels follow the sphere; they add no armour, seams or protrusions.
      float crownPanel = (1.0 - smoothstep(0.036, 0.043, abs(monitorShellPosition.x)))
        * smoothstep(0.07, 0.1, monitorShellPosition.y);
      float sidePanel = smoothstep(0.11, 0.14, abs(monitorShellPosition.x))
        * smoothstep(-0.08, -0.02, monitorShellPosition.z);
      diffuseColor.rgb *= 1.0 - 0.27 * crownPanel - 0.12 * sidePanel;
      `,
    )
  }
  const border: THREE.Vector3[] = []
  const borderPoint = (rawX: number, rawY: number) => {
    const y = rawY + FACE_CENTRE_Y
    const x = rawX
    return new THREE.Vector3(x, y, -Math.sqrt(HEAD_RADIUS ** 2 - x * x - y * y))
  }
  const borderY = (x: number) => 0.08 * Math.sqrt(Math.max(0.015, 1 - (x / 0.155) ** 8))
  for (let i = 0; i <= 80; i++) {
    const x = -0.155 + (i / 80) * 0.31
    border.push(borderPoint(x, 0.0025 + 0.5 * borderY(x)))
  }
  for (let i = 1; i <= 12; i++)
    border.push(
      borderPoint(
        0.155,
        THREE.MathUtils.lerp(0.0025 + 0.5 * borderY(0.155), -borderY(0.155), i / 12),
      ),
    )
  for (let i = 1; i <= 80; i++) {
    const x = 0.155 - (i / 80) * 0.31
    border.push(borderPoint(x, -borderY(x)))
  }
  for (let i = 1; i <= 12; i++)
    border.push(
      borderPoint(
        -0.155,
        THREE.MathUtils.lerp(-borderY(-0.155), 0.0025 + 0.5 * borderY(-0.155), i / 12),
      ),
    )
  const wallPositions: number[] = []
  for (let i = 0; i < border.length - 1; i++) {
    const a = border[i],
      b = border[i + 1]
    const innerA = a.clone().multiplyScalar(0.14 / HEAD_RADIUS)
    const innerB = b.clone().multiplyScalar(0.14 / HEAD_RADIUS)
    for (const p of [a, innerA, b, b, innerA, innerB]) wallPositions.push(p.x, p.y, p.z)
  }
  const wall = new THREE.BufferGeometry()
  wall.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3))
  const smoothWall = mergeVertices(wall)
  smoothWall.computeVertexNormals()
  const recessMaterial = shell.clone()
  recessMaterial.color = shell.color
  recessMaterial.side = THREE.DoubleSide
  recessMaterial.onBeforeCompile = () => {}
  const foam = new THREE.MeshStandardMaterial({
    color: 0x08090b,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  foam.name = 'BlackFoam'
  foam.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 foamPosition;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nfoamPosition = position;',
    )
    shader.fragmentShader = 'varying vec3 foamPosition;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float grain = fract(sin(dot(floor(foamPosition * 1000.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      diffuseColor.rgb *= 0.75 + 0.4 * grain;
    `,
    )
  }
  const displaySurround = foam.clone()
  displaySurround.onBeforeCompile = (shader) => {
    // The display returns meet the enlarged screen as a continuous black surface.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'outgoingLight = vec3(0.0);\n#include <opaque_fragment>',
    )
  }
  add('RecessWall', smoothWall, displaySurround, [0, 0, 0])
  // Small rounded lower lip; the underside remains open, with no chin guard.
  const rimProfile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.1342, -0.1175, 0),
    new THREE.Vector3(0.136, -0.122, 0),
    new THREE.Vector3(0.132, -0.128, 0),
    new THREE.Vector3(0.126, -0.124, 0),
    new THREE.Vector3(0.128, -0.1175, 0),
    new THREE.Vector3(0.1342, -0.1175, 0),
  ])
  const lowerRim = new THREE.LatheGeometry(
    rimProfile.getPoints(32).map((p) => new THREE.Vector2(p.x, p.y)),
    64,
  )
  add('LowerRim', lowerRim, recessMaterial, [0, 0, 0])
  const inner = body.clone()
  inner.scale(0.96, 0.96, 0.96)
  const innerFoam = foam.clone()
  innerFoam.side = THREE.BackSide
  innerFoam.onBeforeCompile = (shader, renderer) => {
    foam.onBeforeCompile(shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `
      #include <clipping_planes_fragment>
      // The lining has the same open face aperture as the plastic shell.
      vec3 liningPosition = foamPosition / 0.96;
      float liningEdge = abs(liningPosition.x) / 0.155;
      float liningBorder = 0.08 * sqrt(max(0.015, 1.0 - pow(liningEdge, 8.0)));
      if (liningPosition.z < 0.0 && liningEdge < 1.0 && liningPosition.y > 0.015 - liningBorder && liningPosition.y < 0.0175 + 0.5 * liningBorder) discard;
      `,
    )
  }
  add('HelmetInterior', inner, innerFoam, [0, 0, 0])
  const propulsionSocket = new THREE.Group()
  propulsionSocket.name = 'PropulsionSocket'
  propulsionSocket.position.set(0, -0.125, 0)
  propulsionSocket.userData.optionalModule = true
  root.add(propulsionSocket)
  const face = new MonitorFace()
  const matrixMode = { value: 1 }
  const screenMaterial = new THREE.MeshBasicMaterial({ map: face.texture, toneMapped: false })
  screenMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.monitorMatrixMode = matrixMode
    shader.fragmentShader = 'uniform float monitorMatrixMode;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 matrixUv = vec2(vMapUv.x, (vMapUv.y - 0.5) * 1.45 + 0.5);
      // Keep the eyes fixed; relocate only the mouth by 20 mm on the recessed display.
      float mouthRegion = 1.0 - step(0.375, matrixUv.y);
      matrixUv.y += 0.3 * mouthRegion;
      float faceMask = 1.0 - mouthRegion * step(0.375, matrixUv.y);
      vec2 monitorUv = mix(vMapUv, matrixUv, monitorMatrixMode);
      #define vMapUv monitorUv
      #include <map_fragment>
      #undef vMapUv
      vec2 pixelCell = fract(monitorUv * vec2(${MONITOR_COLUMNS}.0, ${MONITOR_ROWS}.0));
      float pixelMask = step(0.12, pixelCell.x) * step(pixelCell.x, 0.88) * step(0.12, pixelCell.y) * step(pixelCell.y, 0.88) * step(0.0, monitorUv.y) * step(monitorUv.y, 1.0) * faceMask;
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.0003, 0.0008, 0.002), diffuseColor.rgb, pixelMask), monitorMatrixMode);
    `,
    )
  }
  const screen = add('Screen', curvedScreen(0.34, 0.22, 0.1401), screenMaterial, [0, 0, 0])
  screen.castShadow = false
  screen.userData.matrix = [MONITOR_COLUMNS, MONITOR_ROWS]
  const shades = new THREE.Group()
  shades.name = 'SunglassesPivot'
  root.add(shades)
  const hingeMaterial = new THREE.MeshStandardMaterial({
    color: 0x242930,
    roughness: 0.65,
    metalness: 0,
  })
  for (const side of [-1, 1]) {
    const hinge = new THREE.CircleGeometry(0.041, 64)
    const positions = hinge.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i),
        z = -side * positions.getX(i)
      positions.setXYZ(i, side * Math.sqrt(0.178 ** 2 - y * y - z * z), y, z)
    }
    hinge.computeVertexNormals()
    add(side < 0 ? 'HingeLeft' : 'HingeRight', hinge, hingeMaterial, [0, 0, 0])
  }
  // The visor retracts inside the plastic shell, outside the recessed foam and display.
  const visorPoint = (u: number, v: number) => {
    const edge = Math.abs(u)
    const y = v * 0.085 * (1 - 0.65 * edge ** 4) + 0.012 * (1 - edge * edge)
    const ring = Math.sqrt(0.177 ** 2 - y * y)
    return new THREE.Vector3(Math.sin(u * 1.5) * ring, y, -Math.cos(u * 1.5) * ring)
  }
  const visor = new THREE.PlaneGeometry(2, 2, 80, 24)
  const visorPositions = visor.getAttribute('position')
  for (let i = 0; i < visorPositions.count; i++) {
    const p = visorPoint(-visorPositions.getX(i), visorPositions.getY(i))
    visorPositions.setXYZ(i, p.x, p.y, p.z)
  }
  visor.computeVertexNormals()
  const tint = new THREE.MeshPhysicalMaterial({
    color: 0x08090b,
    metalness: 0,
    roughness: 0.42,
    clearcoat: 0.12,
    clearcoatRoughness: 0.45,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const lens = add('SmokedSunglasses', visor, tint, [0, 0, 0], shades)
  lens.castShadow = false
  const visorEdge = new THREE.MeshStandardMaterial({
    color: 0x101318,
    metalness: 0,
    roughness: 0.65,
  })
  const support = new THREE.Group()
  support.name = 'VisorSupport'
  shades.add(support)
  const upperBridge = new THREE.PlaneGeometry(2, 2, 80, 2)
  const bridgePositions = upperBridge.getAttribute('position')
  for (let i = 0; i < bridgePositions.count; i++) {
    const p = visorPoint(-bridgePositions.getX(i), 1 + bridgePositions.getY(i) * 0.055)
    p.multiplyScalar(1.002)
    bridgePositions.setXYZ(i, p.x, p.y, p.z)
  }
  upperBridge.computeVertexNormals()
  visorEdge.side = THREE.DoubleSide
  add('VisorUpperBridge', upperBridge, visorEdge, [0, 0, 0], support)
  for (const side of [-1, 1]) {
    const earCover = new THREE.CircleGeometry(0.039, 64)
    const positions = earCover.getAttribute('position')
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i),
        z = -side * positions.getX(i)
      positions.setXYZ(i, side * (Math.sqrt(0.1787 ** 2 - y * y - z * z) - 0.1787), y, z)
    }
    earCover.computeVertexNormals()
    add(
      side < 0 ? 'VisorEarCoverLeft' : 'VisorEarCoverRight',
      earCover,
      visorEdge,
      [side * 0.1787, 0, 0],
      support,
    )
  }
  for (const edge of [-1, 1]) {
    const points = Array.from({ length: 81 }, (_, i) => visorPoint((i / 80) * 2 - 1, edge))
    add(
      'VisorEdge',
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.0008, 6, false),
      visorEdge,
      [0, 0, 0],
      shades,
    )
    const upper = visorPoint(edge, 1),
      lower = visorPoint(edge, -1)
    const ear = new THREE.Vector3(edge * 0.1787, 0, 0)
    const tab = new THREE.BufferGeometry()
    tab.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [...upper.toArray(), ...lower.toArray(), ...ear.toArray()],
        3,
      ),
    )
    tab.computeVertexNormals()
    add('VisorHingeTab', tab, visorEdge, [0, 0, 0], support).castShadow = false
  }
  shades.rotation.x = VISOR_TRAVEL
  monitors.set(root, {
    face,
    shades,
    target: VISOR_TRAVEL,
    screen: screen as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    matrixMode,
    tint,
    shell,
  })
  const displayModule = new THREE.Group()
  displayModule.name = 'DisplayModule'
  displayModule.add(screen)
  root.add(displayModule)
  const helmetForm = new THREE.Group()
  helmetForm.name = 'HelmetForm'
  for (const child of [...root.children]) helmetForm.add(child)
  helmetForm.scale.x = 0.8
  root.add(helmetForm)
  root.scale.setScalar(0.825)
  return root
}

/** Set a player's helmet paint independently of the face, trim and smoked glasses. */
export function setMonitorHelmetColor(model: THREE.Group, color: THREE.ColorRepresentation): void {
  monitors.get(model)?.shell.color.set(color)
}

/** Slide the concentric outer sun visor; the fixed pixel display never rotates with it. */
export function setMonitorSunglasses(model: THREE.Group, lowered: boolean): void {
  const monitor = monitors.get(model)
  if (monitor) monitor.target = lowered ? 0 : VISOR_TRAVEL
}

/** Set visor travel from lowered (0) to fully retracted (1), always on the same sphere. */
export function setMonitorVisorPosition(model: THREE.Group, position: number): void {
  const monitor = monitors.get(model)
  if (monitor && Number.isFinite(position))
    monitor.target = THREE.MathUtils.clamp(position, 0, 1) * VISOR_TRAVEL
}

/** Regulate the plastic visor from clear (0) to black sunglasses (1). */
export function setMonitorVisorTint(model: THREE.Group, darkness: number): void {
  const monitor = monitors.get(model)
  if (!monitor || !Number.isFinite(darkness)) return
  const amount = THREE.MathUtils.clamp(darkness, 0, 1)
  monitor.tint.opacity = THREE.MathUtils.lerp(0.025, 0.72, amount)
  monitor.tint.color.set(0x050609)
}

/** Display a caller-owned photo/video texture on the curved face; null restores blue pixels.
 * The caller configures its texture (including sRGB) and retains disposal ownership.
 */
export function setMonitorPortrait(model: THREE.Group, texture: THREE.Texture | null): void {
  const monitor = monitors.get(model)
  if (!monitor) return
  monitor.screen.material.map = texture ?? monitor.face.texture
  monitor.matrixMode.value = texture ? 0 : 1
  monitor.screen.material.needsUpdate = true
}

/** Advance reusable face pixels and smooth the glasses hinge without changing the driver pose. */
export function updateMonitorAvatar(model: THREE.Group, elapsed: number, driving = false): void {
  const monitor = monitors.get(model)
  if (!monitor) return
  const step = Number.isFinite(elapsed) ? Math.min(Math.max(elapsed, 0), 0.1) : 0
  if (monitor.matrixMode.value === 1) monitor.face.update(step, driving)
  monitor.shades.rotation.x = THREE.MathUtils.lerp(
    monitor.shades.rotation.x,
    monitor.target,
    1 - Math.exp(-9 * step),
  )
}

/** The SceneView owns this texture; normal object disposal owns all meshes and materials. */
export function disposeMonitorAvatar(model: THREE.Group): void {
  monitors.get(model)?.face.dispose()
  monitors.delete(model)
}

/** Presentation only: the existing player collider remains the sole locomotion body. */
export class MonitorMotion {
  private previous: THREE.Vector3 | null = null
  private velocity = new THREE.Vector3()
  private time = 0
  reset(): void {
    this.previous = null
    this.velocity.set(0, 0, 0)
  }
  update(model: THREE.Group, position: THREE.Vector3, yaw: number, dt: number): void {
    const elapsed = Math.min(Math.max(dt, 0), 0.1)
    this.time += elapsed
    const delta = this.previous ? position.clone().sub(this.previous) : new THREE.Vector3()
    const reset = !this.previous || delta.length() > 2 || elapsed < 0.001
    const measured = reset ? new THREE.Vector3() : delta.divideScalar(elapsed)
    const before = this.velocity.clone()
    if (reset) this.velocity.set(0, 0, 0)
    else this.velocity.lerp(measured, 1 - Math.exp(-10 * elapsed))
    const velocity = this.velocity.clone()
    const acceleration = reset
      ? new THREE.Vector3()
      : velocity.clone().sub(before).divideScalar(elapsed)
    this.previous = position.clone()
    const inverseYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw)
    velocity.applyQuaternion(inverseYaw)
    acceleration.applyQuaternion(inverseYaw)
    const pitch = THREE.MathUtils.clamp(velocity.z * 0.055 + acceleration.z * 0.004, -0.32, 0.32)
    const roll = THREE.MathUtils.clamp(-velocity.x * 0.055 - acceleration.x * 0.004, -0.3, 0.3)
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0, roll, 'YXZ'))
    if (reset) model.quaternion.copy(target)
    else model.quaternion.slerp(target, 1 - Math.exp(-7 * elapsed))
    model.position.y =
      0.35 + Math.sin(this.time * 1.2) * 0.0015 + Math.sin(this.time * 1.8) * 0.0004
  }
}
