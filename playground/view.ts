import { BuildingBatches } from './building-batches.js'
import { isMapBuilding } from '../src/scene.js'
import { SURFACE_LAYERS, mapSurfaceColor } from '../src/landcover.js'
import { withinMapDistance } from './map-visibility.js'
import { CarrierThrusters } from './carrier-thrusters.js'
import { takeMapGeometry } from './map-geometry.js'
import { Streetlights } from './streetlights.js'
import { CarLights } from './car-lights.js'
import { CarMirrors } from './car-mirrors.js'
import { CarInstruments } from './car-instruments.js'
import { RoadBatches } from './road-batches.js'
import { LandcoverBatches } from './landcover-batches.js'
import { carrierInterior } from './carrier-interior.js'
import { ImpactMarks } from './impact-marks.js'
import { roadGeometry } from '../src/draped-road.js'
import { terrainVertices, terrainIndices } from '../src/terrain.js'
import { triangles, trianglesWithRoofInfo } from '../src/solid.js'
import { UprightBillboard, softenFoliage } from './billboard.js'
import { driverHeadPose } from './driving-camera.js'
import { createMonitorAvatar, MonitorMotion } from './avatar.js'
import { createPortalSurface, type PortalSurface } from './portals.js'
import { PORTAL_BAR } from '../src/portal.js'
import { assets, disposeObject } from './assets.js'
import { vehicleDefinition, type VisualDefinition } from '../src/index.js'
import * as THREE from 'three'
import {
  SceneGraph,
  type SceneDocument,
  type Entity,
  type Simulation,
  type Transform,
} from '../src/index.js'

function mesh(geometry: THREE.BufferGeometry, color: string, roughness = 0.72): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color, roughness })
  const m = new THREE.Mesh(geometry, material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}
function box(size: number[], color: string): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...(size as [number, number, number])), color)
}
export function applyPose(object: THREE.Object3D, pose: Transform): void {
  object.position.fromArray(pose.position)
  object.quaternion.fromArray(pose.rotation)
}
export class SceneView {
  private readonly thrusters = new Map<string, CarrierThrusters>()
  private readonly carLights = new Map<string, CarLights>()
  private readonly carMirrors = new Map<string, CarMirrors>()
  private readonly instruments = new Map<string, CarInstruments>()
  readonly helmScreens = new Map<string, THREE.Mesh>()
  readonly touchScreens = new Map<string, THREE.Mesh>()
  readonly flightScreens = new Map<string, THREE.Mesh>()
  readonly portalTablets = new Map<string, THREE.Mesh[]>()
  readonly impacts = new ImpactMarks()
  readonly root = new THREE.Group()
  readonly streetlights = new Streetlights(this.root)
  private readonly roads = new RoadBatches()
  private readonly buildings = new BuildingBatches()
  batchBuildings = true
  get pendingBuildingBatches(): boolean {
    return this.batchBuildings && this.buildings.pending
  }
  private materialSetup?: (material: THREE.Material) => void
  private readonly landcover = new LandcoverBatches()
  private readonly mapBounds = new Map<string, THREE.Sphere>()
  readonly objects = new Map<string, THREE.Group>()
  readonly sprites = new Map<string, THREE.Sprite | UprightBillboard>()
  private readonly spritePixels = new Map<string, ImageData>()
  private readonly spriteImages = new Map<
    string,
    Promise<{ texture: THREE.Texture; pixels: ImageData }>
  >()
  readonly portals = new Map<string, PortalSurface>()
  readonly wheels = new Map<string, THREE.Group[]>()
  readonly steering = new Map<string, THREE.Group>()
  readonly ramps = new Map<string, THREE.Group>()
  readonly ready: Promise<void>
  private readonly loading: Promise<void>[] = []
  private disposed = false
  readonly avatar = new THREE.Group()
  private readonly monitor = createMonitorAvatar()
  private readonly monitorMotion = new MonitorMotion()
  private graph: SceneGraph
  constructor(readonly document: SceneDocument) {
    this.graph = new SceneGraph(document)
    this.addEntities(document.entities)
    this.root.add(this.roads.root)
    this.root.add(this.buildings.root)
    this.root.add(this.landcover.root)
    this.avatar.add(this.monitor)
    this.avatar.visible = false
    this.root.add(this.avatar)
    this.ready = Promise.all(this.loading).then(() => undefined)
  }
  replaceMapEntities(remove: Set<string>, add: Entity[]): void {
    for (const id of remove) {
      const object = this.objects.get(id)
      if (object) {
        this.impacts.removeFor(object)
        object.removeFromParent()
        disposeObject(object)
      }
      this.objects.delete(id)
      this.mapBounds.delete(id)
      this.sprites.delete(id)
      this.spritePixels.delete(id)
    }
    this.document.entities = [
      ...this.document.entities.filter((e) => !remove.has(e.id)),
      ...structuredClone(add),
    ]
    this.graph = SceneGraph.fromValidated(this.document)
    this.addEntities(add)
    if (this.materialSetup) this.setupMaterials(this.materialSetup)
    // Resource promises are consumed per batch rather than retained for the whole journey.
    void Promise.all(this.loading.splice(0)).catch(() => undefined)
  }
  private addEntities(entities: Entity[]): void {
    for (const e of entities) {
      const group = new THREE.Group()
      group.userData.entityId = e.id
      this.objects.set(e.id, group)
      this.root.add(group)
      applyPose(group, this.graph.worldTransform(e.id))
      if (e.portal) {
        const portal = createPortalSurface(e)
        this.portals.set(e.id, portal)
        group.add(portal.mesh)
        portal.mesh.visible = !e.parentId || e.portal.mode !== 'closed'
        const [w, h, d] = e.size
        if (!e.parentId)
          this.addAsset(
            group,
            {
              url: '/world/portal.frame.glb',
              transform: { position: [0, -(h + 2 * PORTAL_BAR) / 2, 0], rotation: [0, 0, 0, 1] },
            },
            undefined,
            (model) => {
              model.scale.set((w + 2 * PORTAL_BAR) / 3.436068, (h + 2 * PORTAL_BAR) / 2.2, d / 0.08)
            },
          )
        const light = mesh(
          new THREE.BoxGeometry(w * 0.7, 0.035, 0.02),
          e.portal.mode === 'open' ? '#5bacff' : e.portal.mode === 'window' ? '#accbff' : '#354254',
        )
        light.position.set(0, h / 2 + PORTAL_BAR / 2, d / 2 + 0.015)
        light.name = 'Portal status'
        group.add(light)
        if (!e.parentId) {
          const back = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ color: '#08090b' }),
          )
          back.position.z = -d / 2
          back.rotation.y = Math.PI
          group.add(back)
          const tablet = box([0.62, 0.44, 0.008], '#050608')
          tablet.position.set(0, -0.24, -d / 2 - 0.004)
          group.add(tablet)
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.58, 0.4),
            new THREE.MeshBasicMaterial({ color: '#030405' }),
          )
          screen.position.set(0, -0.24, -d / 2 - 0.0082)
          screen.rotation.y = Math.PI
          group.add(screen)
          this.portalTablets.set(e.id, [screen])
        }
      }
      if (e.sprite) {
        const options = {
          color: /^\/sprites\/tree(?:-\d+)?\.png$/.test(e.sprite.url) ? '#c5d2b9' : '#ffffff',
          alphaTest: 0.1,
          transparent: false,
          depthWrite: true,
        }
        const material = e.sprite.upright
          ? new THREE.MeshBasicMaterial({ ...options, side: THREE.DoubleSide })
          : new THREE.SpriteMaterial(options)
        if (material instanceof THREE.MeshBasicMaterial)
          softenFoliage(material, e.sprite.saturation ?? 1)
        const sprite =
          material instanceof THREE.MeshBasicMaterial
            ? new UprightBillboard(material)
            : new THREE.Sprite(material)
        if (sprite instanceof THREE.Sprite) sprite.center.set(0.5, 0)
        // Keep overhead-facing billboards above the ground image overlay.
        sprite.position.y = 0.02
        sprite.scale.set(e.size[0], e.size[1], 1)
        sprite.userData.entityId = e.id
        group.add(sprite)
        this.sprites.set(e.id, sprite)
        const url = e.sprite.url
        if (!this.spriteImages.has(url)) {
          this.spriteImages.set(
            url,
            new Promise((resolve, reject) => {
              new THREE.TextureLoader().load(
                url,
                (texture) => {
                  texture.colorSpace = THREE.SRGBColorSpace
                  const canvas = window.document.createElement('canvas')
                  canvas.width = texture.image.width
                  canvas.height = texture.image.height
                  const context = canvas.getContext('2d')!
                  context.drawImage(texture.image, 0, 0)
                  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
                  if (this.disposed) texture.dispose()
                  else this.surfaceTextures.push(texture)
                  resolve({ texture, pixels })
                },
                undefined,
                reject,
              )
            }),
          )
        }
        this.loading.push(
          this.spriteImages.get(url)!.then(({ texture, pixels }) => {
            if (this.disposed || this.objects.get(e.id) !== group) return
            material.map = texture
            material.needsUpdate = true
            this.spritePixels.set(e.id, pixels)
            if (e.sprite!.groundShadow) {
              const shadow = new THREE.Mesh(
                new THREE.PlaneGeometry(e.size[0], e.size[1] * 0.7).translate(
                  0,
                  e.size[1] * 0.35,
                  0,
                ),
                new THREE.MeshBasicMaterial({
                  map: texture,
                  color: '#000000',
                  transparent: true,
                  opacity: 0.22,
                  depthWrite: false,
                  alphaTest: 0.02,
                  polygonOffset: true,
                  polygonOffsetFactor: -1,
                  polygonOffsetUnits: -1,
                }),
              )
              shadow.rotation.set(-Math.PI / 2, 0, -0.65)
              shadow.position.y = 0.012
              shadow.userData.decorativeShadow = true
              shadow.raycast = () => undefined
              group.add(shadow)
            }
          }),
        )
      }
      if (e.road) {
        let g = takeMapGeometry(e)
        if (!g) {
          const t = this.document.entities.find((n) => n.id === e.road!.terrainId)!.terrain!
          const data = roadGeometry(t, e.road.paths, e.road.width, {
            elevation: e.road.elevation,
            layer: e.road.layer,
            profiled: e.road.profiled,
            mode: e.road.mode,
          })
          g = new THREE.BufferGeometry()
          g.setAttribute('position', new THREE.Float32BufferAttribute(data.vertices.flat(), 3))
          g.setIndex(data.faces.flat())
          g.computeVertexNormals()
        }
        const surface = mesh(g, e.color)
        ;(surface.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
        surface.position.y = ['footway', 'path', 'pedestrian', 'cycleway'].includes(
          e.source?.tags.highway ?? '',
        )
          ? -0.01
          : 0
        surface.castShadow = false
        group.add(surface)
      }
      if (e.terrain) {
        let g = takeMapGeometry(e)
        if (!g) {
          g = new THREE.BufferGeometry()
          g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(terrainVertices(e.terrain).flat(), 3),
          )
          g.setIndex(terrainIndices(e.terrain))
          g.computeVertexNormals()
        }
        group.add(mesh(g, mapSurfaceColor('default', e.color)))
      }
      if (e.geometry) {
        let geometry = takeMapGeometry(e)
        const hasRoofColor = !!(e.roofColor && e.geometry.roofFaces?.length)
        // Geometry may be pre-prepared with vertex colors (from map worker) or need generation
        if (geometry && hasRoofColor && !geometry.hasAttribute('color')) {
          geometry.dispose()
          geometry = undefined
        }
        const hasVertexColors = !!geometry?.hasAttribute('color') || hasRoofColor
        if (!geometry) {
          geometry = new THREE.BufferGeometry()
          if (hasRoofColor) {
            // Use trianglesWithRoofInfo to get roof/wall separation
            const { indices, isRoof } = trianglesWithRoofInfo(e.geometry)
            const positions: number[] = []
            const colors: number[] = []
            const wallColor = new THREE.Color(e.color)
            const roofColor = new THREE.Color(e.roofColor!)
            for (let i = 0; i < indices.length; i++) {
              const tri = indices[i]
              const color = isRoof[i] ? roofColor : wallColor
              for (const idx of tri) {
                const v = e.geometry!.vertices[idx]
                positions.push(v[0], v[1], v[2])
                colors.push(color.r, color.g, color.b)
              }
            }
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
          } else {
            geometry.setAttribute(
              'position',
              new THREE.Float32BufferAttribute(
                triangles(e.geometry).flatMap((f) => f.flatMap((i) => e.geometry!.vertices[i])),
                3,
              ),
            )
          }
          geometry.computeVertexNormals()
        }
        const material = new THREE.MeshStandardMaterial({
          color: hasVertexColors
            ? '#ffffff'
            : e.landcover
              ? mapSurfaceColor(e.landcover.surface, e.color)
              : e.color,
          roughness: 0.72,
          vertexColors: hasVertexColors,
          side: e.source ? THREE.FrontSide : THREE.DoubleSide,
        })
        const surface = new THREE.Mesh(geometry, material)
        surface.castShadow = !e.landcover
        surface.receiveShadow = true
        if (e.landcover) {
          const layer = SURFACE_LAYERS[e.landcover.surface]
          material.polygonOffset = true
          material.polygonOffsetFactor = -layer
          material.polygonOffsetUnits = -layer
          surface.renderOrder = layer
        }

        group.add(surface)
      }
      if (e.kind === 'box' && !e.light) group.add(box(e.size, e.color))
      if (e.light) this.streetlights.add(e, group)
      if (e.kind === 'vehicle') {
        if (e.vehicle?.interior && e.visual?.body.url.includes('ship.container')) {
          const thrusters = new CarrierThrusters()
          group.add(thrusters.root)
          this.thrusters.set(e.id, thrusters)
          const interior = carrierInterior()
          group.add(interior.room)
          this.helmScreens.set(e.id, interior.screens[1])
          this.touchScreens.set(e.id, interior.touch)
          this.flightScreens.set(e.id, interior.screens[0])
          for (const mouth of this.document.entities.filter((m) => m.parentId === e.id && m.portal))
            this.portalTablets.set(mouth.id, [interior.screens[mouth.portal!.clearsRamp ? 2 : 0]])
        }
        if (e.visual) this.assetVehicle(e, group)
        else this.car(e, group)
      }
      if (e.kind === 'spawn') {
        const ring = mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 40), '#79b7ff')
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.05
        const marker = mesh(new THREE.ConeGeometry(0.18, 0.5, 4), '#79b7ff')
        marker.position.y = 0.65
        group.add(ring, marker)
      }
    }
    for (const entity of entities) {
      if (!entity.surface) continue
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(entity.size[0], entity.size[2]),
        material,
      )
      plane.rotation.x = -Math.PI / 2
      plane.position.y = entity.size[1] / 2 + 0.006
      plane.receiveShadow = true
      this.objects.get(entity.id)!.add(plane)
      this.loading.push(
        new Promise<void>((resolve, reject) => {
          new THREE.TextureLoader().load(
            entity.surface!.url,
            (texture) => {
              if (this.disposed) {
                texture.dispose()
                resolve()
                return
              }
              texture.colorSpace = THREE.SRGBColorSpace
              material.map = texture
              material.needsUpdate = true
              this.surfaceTextures.push(texture)
              resolve()
            },
            undefined,
            reject,
          )
        }),
      )
    }
  }
  private addAsset(
    parent: THREE.Group,
    part: VisualDefinition['body'],
    fallback?: THREE.Object3D,
    prepare?: (model: THREE.Group) => void,
  ): void {
    this.loading.push(
      assets.instantiate(part.url).then((model) => {
        if (this.disposed) {
          disposeObject(model)
          return
        }
        applyPose(model, part.transform)
        parent.add(model)
        prepare?.(model)
        if (this.materialSetup) this.setupMaterials(this.materialSetup)
        if (fallback) {
          fallback.removeFromParent()
          disposeObject(fallback)
        }
      }),
    )
  }
  private assetVehicle(e: Entity, group: THREE.Group): void {
    const visual = e.visual!,
      definition = vehicleDefinition(e)
    const fallback = box(e.size, e.color)
    group.add(fallback)
    this.addAsset(group, visual.body, fallback, (model) => {
      if (visual.body.url === '/world/car.audi.a3.cabrio.glb') {
        this.carLights.set(e.id, new CarLights(model))
        this.carMirrors.set(e.id, new CarMirrors(model))
        const interior = model.getObjectByName('Interior')
        if (interior) {
          const instruments = new CarInstruments(interior)
          instruments.update(this.document, this.graph.worldTransform(e.id), 0, performance.now())
          this.instruments.set(e.id, instruments)
        }
      }
      for (const name of ['Helm_Screen_1', 'Helm_Screen_2', 'Helm_Screen_3']) {
        const original = model.getObjectByName(name)
        if (original) original.visible = false
      }
      if (!visual.ramp) return
      const hinge = new THREE.Group()
      hinge.position.fromArray(visual.ramp.hinge)
      model.add(hinge)
      for (const name of visual.ramp.nodes) {
        const part = model.getObjectByName(name)
        if (!part) throw new Error('Missing ramp node: ' + name)
        hinge.attach(part)
      }
      this.ramps.set(e.id, hinge)
    })
    if (visual.wheel) {
      const wheels = definition.hubs.map((hub, i) => {
        const wheel = new THREE.Group()
        wheel.position.fromArray(hub)
        group.add(wheel)
        const orientation = new THREE.Group()
        if (visual.wheelRotations) orientation.quaternion.fromArray(visual.wheelRotations[i])
        wheel.add(orientation)
        this.addAsset(orientation, visual.wheel!)
        return wheel
      })
      this.wheels.set(e.id, wheels)
    }
    if (visual.steering) {
      const mount = new THREE.Group(),
        spin = new THREE.Group()
      applyPose(mount, visual.steering.transform)
      mount.add(spin)
      group.add(mount)
      this.addAsset(
        spin,
        {
          url: visual.steering.url,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
        },
        undefined,
        (model) => {
          if (visual.steering!.url !== '/world/car.audi.a3.steering.glb') return
          // Undo the baked 2.8° tilt and centre the rim on the Z spin axis.
          model.rotation.x = THREE.MathUtils.degToRad(2.8)
          model.position.y = -0.0275568
        },
      )
      this.steering.set(e.id, spin)
    }
  }
  private car(e: Entity, group: THREE.Group): void {
    const [w, h, l] = e.size
    const body = box(e.size, e.color)
    const cabin = box([w * 0.83, 0.63, l * 0.45], '#273d49')
    cabin.position.set(0, h / 2 + 0.25, l * 0.045)
    const roof = box([w * 0.84, 0.08, l * 0.46], e.color)
    roof.position.copy(cabin.position).y += 0.34
    group.add(body, cabin, roof)
    for (const x of [-w * 0.32, w * 0.32]) {
      const light = box([0.32, 0.12, 0.045], '#fff0cb')
      light.position.set(x, 0.06, -l / 2 - 0.025)
      const tail = box([0.32, 0.1, 0.045], '#db6a5f')
      tail.position.set(x, 0.06, l / 2 + 0.025)
      group.add(light, tail)
    }
    const wheels: THREE.Group[] = []
    for (const [x, z] of [
      [-w / 2, -l * 0.32],
      [w / 2, -l * 0.32],
      [-w / 2, l * 0.32],
      [w / 2, l * 0.32],
    ]) {
      const geometry = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 20)
      geometry.rotateZ(Math.PI / 2)
      const wheel = mesh(geometry, '#202b33')
      const hub = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.251, 12), '#afbbc0', 0.4)
      hub.rotation.z = Math.PI / 2
      wheel.add(hub)
      wheel.position.set(x, -h * 0.3 - 0.35, z)
      group.add(wheel)
      const wrapper = new THREE.Group()
      wrapper.position.copy(wheel.position)
      wheel.position.set(0, 0, 0)
      wrapper.add(wheel)
      group.add(wrapper)
      wheels.push(wrapper)
    }
    this.wheels.set(e.id, wheels)
  }
  /** Distance culling is repeated for portal cameras, never shared from the main frustum. */
  limitDrawDistance(
    position: THREE.Vector3,
    distance: number,
    enabled: boolean,
    buildings = true,
    roadDistance = distance,
    now = performance.now(),
  ): void {
    this.buildings.update(
      this.document.entities,
      this.objects,
      buildings && this.batchBuildings,
      position,
      distance,
    )
    this.roads.update(this.document.entities, this.objects, enabled, position, roadDistance)
    this.landcover.update(this.document.entities, this.objects, enabled, position, distance, now)
    for (const e of this.document.entities) {
      if (!e.source || e.motion === 'dynamic' || e.portal) continue
      const object = this.objects.get(e.id)!
      if (isMapBuilding(e)) {
        // Keep the entity frame alive for picking and attached bullet marks.
        for (const child of object.children)
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
            child.visible = !this.buildings.covers(e.id)
      }
      if ((enabled && (e.road || e.landcover)) || (isMapBuilding(e) && !buildings)) {
        object.visible = false
        continue
      }
      let bounds = this.mapBounds.get(e.id)
      if (!bounds) {
        object.updateWorldMatrix(true, true)
        bounds = new THREE.Box3().setFromObject(object).getBoundingSphere(new THREE.Sphere())
        // Store absolute coordinates even while the render origin is rebased.
        bounds.center.sub(this.root.position)
        this.mapBounds.set(e.id, bounds)
      }
      object.visible =
        !enabled || withinMapDistance(bounds.center, position, bounds.radius, distance)
    }
  }
  setPlaying(playing: boolean): void {
    this.avatar.visible = playing
    if (!playing) for (const thrusters of this.thrusters.values()) thrusters.root.visible = false
    for (const e of this.document.entities)
      if (e.kind === 'spawn' || (e.kind === 'group' && !e.portal && !e.sprite && !e.road))
        this.objects.get(e.id)!.visible = !playing
  }
  sync(sim: Simulation, elapsed = 1 / 60, cockpit = false, headYaw = 0, headPitch = 0.05): void {
    for (const e of this.document.entities) {
      if (e.terrain || (e.source && e.motion !== 'dynamic' && !e.portal)) continue
      applyPose(this.objects.get(e.id)!, sim.entityTransform(e.id, true))
      if (e.portal) {
        e.portal = sim.portalState(e.id)
        this.portals.get(e.id)!.mesh.visible =
          !e.parentId ||
          e.portal.mode !== 'closed' ||
          (!!e.portal.clearsRamp && sim.vehicleInfo(e.parentId).rampClosed)
        const light = this.objects.get(e.id)!.getObjectByName('Portal status') as THREE.Mesh<
          THREE.BoxGeometry,
          THREE.MeshStandardMaterial
        >
        light.material.color.set(e.portal.mode === 'open' ? '#5bacff' : '#354254')
      }
    }
    for (const [id, wheels] of this.wheels) {
      const poses = sim.wheelTransforms(id, true)
      poses.forEach((p, i) => {
        // Wheel snapshots are in world space; render beneath an identity root.
        this.root.add(wheels[i])
        applyPose(wheels[i], p)
      })
    }
    for (const [id, thrusters] of this.thrusters) {
      const info = sim.vehicleInfo(id)
      thrusters.update(!!info.flightMode, info.speedKmh, elapsed, performance.now())
    }
    for (const [id, ramp] of this.ramps) ramp.rotation.x = sim.vehicleInfo(id).rampAngle
    for (const [id, wheel] of this.steering)
      wheel.rotation.z =
        -THREE.MathUtils.clamp(sim.vehicleInfo(id).steer / 0.45, -1, 1) * (Math.PI / 2)
    for (const [id, lights] of this.carLights) {
      const info = sim.vehicleInfo(id)
      lights.update(
        { powered: sim.player.vehicleId === id, braking: info.braking, reversing: info.reversing },
        performance.now(),
      )
    }
    for (const [id, instruments] of this.instruments) {
      instruments.setPowered(sim.player.vehicleId === id)
      if (sim.player.vehicleId === id)
        instruments.update(
          this.document,
          sim.entityTransform(id, true),
          sim.vehicleInfo(id, true).speedKmh,
          performance.now(),
        )
    }
    const vehicleId = sim.player.vehicleId
    if (vehicleId) {
      const info = sim.vehicleInfo(vehicleId, true)
      const head = driverHeadPose(
        info.driver,
        sim.entityTransform(vehicleId, true).rotation,
        info.isCarrier,
        headYaw,
        headPitch,
      )
      this.avatar.position.copy(head.position)
      this.avatar.quaternion.copy(head.quaternion)
      this.monitor.position.set(0, 0, 0)
      this.monitor.quaternion.identity()
      this.monitor.scale.setScalar(0.5)
      this.monitorMotion.reset()
      this.avatar.visible = !cockpit
    } else {
      this.avatar.position.fromArray(sim.renderPlayerPosition)
      this.avatar.quaternion.fromArray(sim.playerFrame?.rotation ?? [0, 0, 0, 1])
      this.avatar.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sim.player.yaw),
      )
      this.monitor.scale.setScalar(0.825)
      this.monitorMotion.update(
        this.monitor,
        sim.playerFrame
          ? this.avatar.position
              .clone()
              .sub(new THREE.Vector3(...sim.playerFrame.position))
              .applyQuaternion(new THREE.Quaternion(...sim.playerFrame.rotation).invert())
          : this.avatar.position,
        sim.player.yaw,
        elapsed,
      )
      if (sim.options.playerMode === 'hover') this.monitor.position.y -= 0.35
      this.avatar.visible = !cockpit
    }
  }
  hitSprite(ray: THREE.Raycaster): THREE.Intersection | undefined {
    const renderOffset = this.root.position.clone()
    this.root.position.set(0, 0, 0)
    this.root.updateMatrixWorld(true)
    const hit = ray.intersectObjects([...this.sprites.values()], false).find((hit) => {
      if (!hit.object.visible || !hit.uv) return false
      const pixels = this.spritePixels.get(hit.object.userData.entityId as string)
      if (!pixels) return false
      const x = Math.min(pixels.width - 1, Math.max(0, Math.floor(hit.uv.x * pixels.width)))
      const y = Math.min(pixels.height - 1, Math.max(0, Math.floor((1 - hit.uv.y) * pixels.height)))
      return pixels.data[(y * pixels.width + x) * 4 + 3] >= 26
    })
    this.root.position.copy(renderOffset)
    this.root.updateMatrixWorld(true)
    return hit
  }
  private readonly surfaceTextures: THREE.Texture[] = []
  signal(id: string, side: number): void {
    this.carLights.get(id)?.toggle(side)
  }
  renderMirrors(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    vehicleId: string | null,
    now: number,
  ): void {
    if (!this.carMirrors.size) {
      renderer.domElement.dataset.mirrorActive = 'false'
      return
    }
    // Inactive cars are processed first so diagnostics describe the occupied car.
    for (const [id, mirrors] of [...this.carMirrors].sort(
      ([a], [b]) => Number(a === vehicleId) - Number(b === vehicleId),
    ))
      mirrors.render(renderer, scene, camera, id === vehicleId, now)
  }
  /** Traverse all materials and call the callback for CSM setup. */
  setupMaterials(callback: (material: THREE.Material) => void): void {
    this.materialSetup = callback
    this.roads.onMaterial = callback
    this.buildings.onMaterial = callback
    this.landcover.onMaterial = callback
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.SkinnedMesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial) {
            callback(material)
          }
        }
      }
    })
  }
  dispose(): void {
    for (const mirrors of this.carMirrors.values()) mirrors.dispose()
    this.carMirrors.clear()
    for (const instruments of this.instruments.values()) instruments.dispose()
    this.instruments.clear()
    this.roads.dispose()
    this.buildings.dispose()
    this.landcover.dispose()
    this.impacts.dispose()
    for (const portal of this.portals.values()) portal.target.dispose()
    this.portals.clear()
    this.surfaceTextures.forEach((texture) => texture.dispose())
    this.disposed = true
    this.root.removeFromParent()
    disposeObject(this.root)
  }
}
