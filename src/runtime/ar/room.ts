import * as THREE from 'three'
type Plane = { planeSpace: XRSpace; polygon: readonly DOMPointReadOnly[]; lastChangedTime: number }
type Mesh = {
  meshSpace: XRSpace
  vertices: Float32Array
  indices: Uint32Array
  lastChangedTime: number
}
export type ARRoomSource = 'auto' | 'mesh' | 'planes'
type RoomFrame = XRFrame & { detectedPlanes?: Set<Plane>; detectedMeshes?: Set<Mesh> }
type CaptureSession = XRSession & { initiateRoomCapture?: () => Promise<void> }

/** Room tracking and debug surfaces. No menu, vehicles or application content is created. */
export class ARRoom {
  readonly root = new THREE.Group()
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x39eac3,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  private readonly surfaces = new Map<
    Plane | Mesh,
    { object: THREE.Mesh; changed: number; tracked: boolean }
  >()
  private surfaceSerial = 0
  private selectedSource: ARRoomSource = 'auto'
  get source(): ARRoomSource {
    return this.selectedSource
  }
  setSource(source: ARRoomSource): void {
    this.selectedSource = source
    this.selectSurfaces()
  }
  get surfaceCounts(): { mesh: number; planes: number; active: number } {
    let mesh = 0,
      planes = 0,
      active = 0
    for (const [surface, entry] of this.surfaces) {
      if (entry.tracked) {
        if ('vertices' in surface) mesh++
        else planes++
      }
      if (entry.object.visible) active++
    }
    return { mesh, planes, active }
  }
  private selectSurfaces(): void {
    const hasMesh = [...this.surfaces].some(
      ([surface, entry]) => 'vertices' in surface && entry.tracked,
    )
    const useMesh = this.selectedSource === 'mesh' || (this.selectedSource === 'auto' && hasMesh)
    for (const [surface, entry] of this.surfaces)
      entry.object.visible = entry.tracked && 'vertices' in surface === useMesh
  }
  private captureSession: XRSession | null = null
  private showing = false
  private message = 'Esperando superficies…'
  private ray = new THREE.Raycaster()
  constructor(scene: THREE.Scene) {
    scene.add(this.root)
  }
  get menuStatus(): string {
    return this.message
  }
  setMessage(message: string): void {
    this.message = message
  }
  get surfacesVisible(): boolean {
    return this.showing
  }
  toggleSurfaces(): void {
    this.showing = !this.showing
    this.material.visible = this.showing
    for (const entry of this.surfaces.values())
      (entry.object.material as THREE.Material).visible = this.showing
  }
  get targets(): THREE.Mesh[] {
    this.root.updateWorldMatrix(true, true)
    return [...this.surfaces.values()].filter((e) => e.object.visible).map((e) => e.object)
  }

  ground(from: THREE.Vector3, distance: number): THREE.Vector3 | null {
    this.ray.set(from, new THREE.Vector3(0, -1, 0))
    this.ray.far = distance
    return this.ray.intersectObjects(this.targets, false)[0]?.point ?? null
  }

  capture(session: XRSession): void {
    const capture = (session as CaptureSession).initiateRoomCapture
    if (!capture) {
      this.message = 'Escanea desde Configuración de Quest y vuelve a entrar.'

      return
    }
    if (this.captureSession === session) {
      this.message = 'Para repetir el escaneo, sal y vuelve a entrar en AR.'

      return
    }
    this.captureSession = session
    this.message = 'Sigue las instrucciones de escaneo de Quest…'

    try {
      void Promise.resolve(capture.call(session)).then(
        () => {
          if (this.captureSession !== session) return
          this.message = 'Escaneo terminado. Esperando geometría…'
        },
        () => {
          if (this.captureSession !== session) return
          this.message = 'Escaneo cancelado o no disponible. Sal y vuelve a entrar.'
        },
      )
    } catch {
      this.message = 'No se pudo iniciar el escaneo. Usa Configuración de Quest.'
    }
  }
  update(frame: XRFrame, space: XRReferenceSpace, visible: boolean): void {
    this.root.visible = visible
    this.material.visible = this.showing
    if (!visible) return // A system overlay may temporarily supply no detected surfaces.
    const room = frame as RoomFrame
    const planes = room.detectedPlanes ?? new Set<Plane>()
    const meshes = room.detectedMeshes ?? new Set<Mesh>()
    const current = new Set<Plane | Mesh>([...planes, ...meshes])
    for (const [surface, entry] of this.surfaces)
      if (!current.has(surface)) {
        entry.object.removeFromParent()
        entry.object.geometry.dispose()
        ;(entry.object.material as THREE.Material).dispose()
        this.surfaces.delete(surface)
      }
    for (const surface of current) {
      let entry = this.surfaces.get(surface)
      if (!entry || entry.changed !== surface.lastChangedTime) {
        const geometry = new THREE.BufferGeometry()
        if ('vertices' in surface) {
          geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array(surface.vertices), 3),
          )
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(surface.indices), 1))
        } else {
          const polygon = surface.polygon
          const points = polygon.map((p) => new THREE.Vector2(p.x, p.z))
          geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(
              polygon.flatMap((p) => [p.x, p.y, p.z]),
              3,
            ),
          )
          geometry.setIndex(THREE.ShapeUtils.triangulateShape(points, []).flat())
        }
        if (entry) {
          entry.object.geometry.dispose()
          entry.object.geometry = geometry
          entry.changed = surface.lastChangedTime
        } else {
          const id = ++this.surfaceSerial
          const material = this.material.clone()
          const offset = (id * 0.61803398875) % 1
          material.color.setHSL(
            'vertices' in surface ? 0.36 + offset * 0.38 : offset * 0.13,
            0.9,
            0.6,
          )
          material.visible = this.showing
          entry = {
            object: new THREE.Mesh(geometry, material),
            changed: surface.lastChangedTime,
            tracked: false,
          }
          entry.object.name = `${'vertices' in surface ? 'Malla' : 'Plano'} ${id}`
          entry.object.matrixAutoUpdate = false
          this.root.add(entry.object)
          this.surfaces.set(surface, entry)
        }
      }
      const pose = frame.getPose(
        'planeSpace' in surface ? surface.planeSpace : surface.meshSpace,
        space,
      )
      entry.tracked =
        !!pose && !pose.emulatedPosition && Array.from(pose.transform.matrix).every(Number.isFinite)
      if (entry.tracked && pose) {
        entry.object.matrix.fromArray(pose.transform.matrix)
        entry.object.matrixWorldNeedsUpdate = true
      }
    }
    this.selectSurfaces()
  }
  /** Tracking transforms only; no room geometry or camera imagery is copied. */
  trackingSnapshot() {
    return {
      source: this.source,
      counts: this.surfaceCounts,
      surfaces: [...this.surfaces].slice(0, 32).map(([surface, entry]) => ({
        name: entry.object.name,
        kind: 'vertices' in surface ? 'mesh' : 'plane',
        tracked: entry.tracked,
        active: entry.object.visible,
        matrix: entry.object.matrix.toArray(),
      })),
    }
  }
  reset(): void {
    for (const entry of this.surfaces.values()) {
      entry.object.removeFromParent()
      entry.object.geometry.dispose()
      ;(entry.object.material as THREE.Material).dispose()
    }
    this.surfaces.clear()
    this.surfaceSerial = 0
    this.captureSession = null
  }
  dispose(): void {
    this.reset()
    this.root.removeFromParent()
    this.material.dispose()
  }
}
