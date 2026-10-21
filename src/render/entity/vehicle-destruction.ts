import { fireNodes, flameNodes } from './entity-nodes.js'
import { explosionTuning, vehicleDamageTuning } from '../../config/gameplay-tuning.js'
import { TrunkBalloons } from './trunk-balloons.js'
import { WreckDebris, type DebrisCast } from './wreck-debris.js'
import * as THREE from 'three'
import { ExhaustSmoke } from './exhaust-smoke.js'
import { createLensFlare } from '../planet/lens-flare.js'
import { analyticParticles } from './gpu-particles.js'
import { mergedFlameGeometry, TONGUE_GLSL, WreckFlames } from './wreck-flames.js'
import { cullOffscreen } from './effect-culling.js'

/** Most glass fragments alive at once (one instanced draw). */
const MAX_SHARDS = 96
/** Fragments per broken pane. */
const SHARDS_PER_PANE = 24
/** Seconds a fragment lives. */
const SHARD_LIFE = 1.5
/** Bounding radius of a fragment (the tetrahedron's circumradius), metres. */
const SHARD_RADIUS = 0.035

/** Bounded, reusable explosions, burning wrecks and glass fragments in the scene frame. */
export class VehicleDestruction {
  private readonly damageSmoke = new Map<
    string,
    {
      object: THREE.Object3D
      anchor: THREE.Group
      smoke: ExhaustSmoke
      amount: number
    }
  >()
  /** Damage leaks from the underside; airborne rotation alone never changes health. */
  setDamage(id: string, object: THREE.Object3D, health: number): void {
    let entry = this.damageSmoke.get(id)
    const damage = 1 - health / 100
    if (damage <= vehicleDamageTuning.smokeDamageThreshold || health <= 0) {
      if (entry) {
        entry.smoke.dispose()
        entry.anchor.removeFromParent()
        this.damageSmoke.delete(id)
      }
      return
    }
    if (!entry) {
      const anchor = new THREE.Group()
      this.space.add(anchor)
      const smoke = new ExhaustSmoke(anchor, this.space, {
        direction: [0, 1, 0],
        color: '#171717',
        size: 380,
        lifetime: 3,
        riseSpeed: 0.7,
        capacity: 96,
        emissionRate: 18,
      })
      this.root.add(smoke.root)
      entry = { object, anchor, smoke, amount: 0 }
      this.damageSmoke.set(id, entry)
    }
    entry.amount =
      ((damage - vehicleDamageTuning.smokeDamageThreshold) /
        (1 - vehicleDamageTuning.smokeDamageThreshold)) *
      vehicleDamageTuning.smokeMaxAmount
  }
  private readonly charred = new Map<
    THREE.Material,
    {
      color?: THREE.Color
      emissive?: THREE.Color
      emissiveIntensity?: number
      roughness?: number
      metalness?: number
      flag: unknown
    }
  >()
  private readonly flarePoint = new THREE.Vector3()
  private readonly flare = createLensFlare(new THREE.Vector3(), { position: this.flarePoint })
  private readonly hiddenWreckParts = new Map<THREE.Object3D, boolean>()
  readonly balloons: TrunkBalloons
  private readonly debris: WreckDebris
  private readonly debrisFires: {
    anchor: THREE.Group
    flames: THREE.Group
    material: THREE.MeshBasicMaterial
    tongues?: WreckFlames
    clock: { value: number }
    smoke: ExhaustSmoke
  }[] = []
  readonly root = new THREE.Group()
  readonly glassRoot = new THREE.Group()
  private readonly geometry = new THREE.SphereGeometry(1, 10, 8)
  private readonly flameGeometry = new THREE.PlaneGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
  /** The six tongues merged (WebGL), built on first use and shared by every wreck. */
  private mergedFlames?: THREE.BufferGeometry
  // Keep the light count constant: adding the first explosion lamp otherwise recompiles
  // every lit material in the scene on the gameplay frame.
  private readonly light = new THREE.PointLight('#ff9b22', 0, 8, 2)
  private warmFire?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  private warmSmoke?: ExhaustSmoke
  private warmFlames?: ReturnType<VehicleDestruction['createFlames']>
  /** Short flashes of `burst()`: they live 0.4 s, like the flash phase of a vehicle explosion. */
  private readonly bursts: {
    fire: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
    clock: { value: number }
    age: number
    scale: number
  }[] = []
  /**
   * Burst fireballs not in use. A burst reuses one instead of creating and disposing a material,
   * so the shader program stays alive between bursts (no recompile hitch). At most 24 exist.
   */
  private readonly burstPool: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = []
  private readonly burstClocks = new WeakMap<THREE.Mesh, { value: number }>()
  private readonly burns = new Map<
    string,
    {
      object: THREE.Object3D
      fire: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
      flames: THREE.Group
      flameMaterial: THREE.MeshBasicMaterial
      tongues?: WreckFlames
      smoke: ExhaustSmoke
      age: number
      clock: { value: number }
    }
  >()
  private readonly fragments = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(SHARD_RADIUS),
    new THREE.MeshBasicMaterial({ color: '#b8e5ff', transparent: true, opacity: 0.65 }),
    MAX_SHARDS,
  )
  /**
   * Glass fragments, oldest first, as a ring in preallocated arrays: `(x, y, z)` position and
   * velocity and the age per slot. No allocation per frame or per pane.
   */
  private readonly shardPositions = new Float64Array(MAX_SHARDS * 3)
  private readonly shardVelocities = new Float64Array(MAX_SHARDS * 3)
  private readonly shardAges = new Float64Array(MAX_SHARDS)
  /** Ring index of the oldest live fragment and the live count. */
  private shardHead = 0
  private shardCount = 0
  private readonly shardDummy = new THREE.Object3D()
  /** Local bounds of the live fragments, refreshed each update (for off-screen culling). */
  private readonly shardBounds = new THREE.Box3()
  constructor(private readonly space: THREE.Group) {
    this.debris = new WreckDebris(space)
    this.balloons = new TrunkBalloons(space)
    this.root.name = 'Vehicle explosions'
    this.fragments.count = 0
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Culled through its own bounds: the instanced sphere stays three's (fixed) sort centre.
    this.fragments.frustumCulled = false
    cullOffscreen(this.fragments, {
      box: (target) => target.copy(this.shardBounds),
    })
    this.root.add(this.fragments, this.glassRoot)
    this.space.add(this.light)
    this.flare.intensity.value = 0
    this.flare.mesh.name = 'Explosion lens flare'
    this.space.add(this.flare.mesh)
  }
  /** Small weapon rupture: existing bounded debris pool and swept ground collision. */
  breakWeapon(object: THREE.Group): void {
    this.debris.explode(
      object,
      'broken-sidearm',
      [...object.children].filter((node) => node.visible),
    )
    object.removeFromParent()
  }
  explode(id: string, object: THREE.Object3D, extra: THREE.Object3D[] = []): void {
    if (this.burns.has(id)) return
    if (this.burns.size >= 32) this.remove(this.burns.keys().next().value!)
    const detached = this.debris.explode(object, id, extra)
    // Detach the wheels first: their copies must survive hiding fork/swingarm parents.
    object.traverse((node) => {
      if (
        /^(Puerta(?:[_ -]|$)|Door(?:[_ -]|$)|Cap[oó](?:[_ -]|$)|Maletero(?:[_ -]|$)|Hood(?:[_ -]|$)|Bonnet(?:[_ -]|$)|Trunk(?:[_ -]|$)|Boot(?:[_ -]|$)|Tailgate(?:[_ -]|$)|Fork[_ -]|Lower_Fork|Steering_Pivot$|Swingarm_Pivot$)/i.test(
          node.name,
        )
      ) {
        if (!this.hiddenWreckParts.has(node)) this.hiddenWreckParts.set(node, node.visible)
        node.visible = false
      }
    })
    for (const anchor of detached.slice(0, 8)) {
      if (this.debrisFires.length >= 48) break
      const clock = { value: 0 },
        { flames, material, tongues } = this.createFlames(clock)
      flames.scale.setScalar(0.28)
      this.space.add(flames)
      flames.position.copy(anchor.position)
      const smoke = new ExhaustSmoke(flames, this.space, {
        direction: [0, 1, 0],
        color: '#292522',
        size: 250,
      })
      this.root.add(smoke.root)
      this.debrisFires.push({ anchor, flames, material, tongues, clock, smoke })
    }
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (this.charred.has(material)) continue
        const color =
          'color' in material && material.color instanceof THREE.Color ? material.color : undefined
        const standard = material instanceof THREE.MeshStandardMaterial ? material : undefined
        this.charred.set(material, {
          color: color?.clone(),
          emissive: standard?.emissive.clone(),
          emissiveIntensity: standard?.emissiveIntensity,
          roughness: standard?.roughness,
          metalness: standard?.metalness,
          flag: material.userData.nablaCharred,
        })
        material.userData.nablaCharred = true
        color?.set('#171717')
        if (standard) {
          standard.emissive.set(0)
          standard.emissiveIntensity = 0
          standard.roughness = 0.95
          standard.metalness = 0.1
        }
      }
    })
    const { fire, clock } = this.createFire()
    const { flames, material: flameMaterial, tongues } = this.createFlames(clock, true)
    fire.position.y = 0.5
    const smoke = new ExhaustSmoke(flames, this.space, {
      direction: [0, 1, 0],
      color: '#101010',
      size: 1250,
      emissionRate: 55,
      capacity: 384,
      lifetime: 6,
      riseSpeed: 1.3,
    })
    object.add(fire)
    // Follow the wreck's position in the scene frame, never its roll or pitch.
    this.space.add(flames)
    object.getWorldPosition(flames.position)
    this.space.worldToLocal(flames.position)
    flames.position.y += 0.3
    this.root.add(smoke.root)
    this.burns.set(id, { object, fire, flames, flameMaterial, tongues, smoke, age: 0, clock })
  }
  /**
   * The vehicle explosion's fireball, light and lens flash at `position` (scene space), `scale`
   * times its size (1 = a vehicle). No wreck, flames or smoke follow: it is the flash only, for
   * small things that burst (a shot balloon). Bounded: the oldest flash is recycled past 24.
   */
  burst(position: THREE.Vector3, scale = 1): void {
    if (!Number.isFinite(scale) || scale <= 0) return
    if (this.bursts.length >= 24) this.removeBurst(0)
    let fire = this.burstPool.pop()
    let clock = fire && this.burstClocks.get(fire)
    if (!fire || !clock) {
      ;({ fire, clock } = this.createFire())
      this.burstClocks.set(fire, clock)
    }
    clock.value = 0
    fire.material.opacity = 1
    fire.position.copy(position)
    fire.scale.setScalar(0.2 * scale)
    this.space.add(fire)
    this.bursts.push({ fire, clock, age: 0, scale: Math.min(1, scale) })
  }
  private removeBurst(index: number): void {
    const [burst] = this.bursts.splice(index, 1)
    burst.fire.removeFromParent()
    this.burstPool.push(burst.fire)
  }
  private createFire() {
    const fire = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({
        color: '#ff9b22',
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    const clock = { value: 0 }
    fire.material.onBeforeCompile = (shader) => {
      shader.uniforms.flameTime = clock
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 flamePosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nflamePosition = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 flamePosition; uniform float flameTime;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        float flicker = sin(flamePosition.x * 17.0 + flameTime * 24.0) * sin(flamePosition.z * 13.0 - flameTime * 19.0);
        float heat = clamp(0.75 - flamePosition.y * 0.5 + flicker * 0.18, 0.0, 1.0);
        diffuseColor.rgb = mix(vec3(1.0, 0.12, 0.015), vec3(1.0, 0.92, 0.3), heat);
        diffuseColor.a *= clamp(0.65 + flicker * 0.5 - max(0.0, flamePosition.y) * 0.4, 0.0, 1.0);`,
        )
    }
    fire.material.customProgramCacheKey = () => 'vehicle-fire-v1'
    fireNodes(fire.material, clock)
    return { fire, clock }
  }
  /**
   * Six crossed flame planes. Under WebGL they are one merged draw ({@link WreckFlames}) with the
   * per-tongue sway of a burning car (`animated`) evaluated in the vertex shader; the WebGPU
   * backend keeps six meshes (its flame twin blends each draw over a fresh frame copy).
   */
  private createFlames(clock: { value: number }, animated = false) {
    const merged = analyticParticles()
    const sway = { value: animated ? 1 : 0 }
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.flameTime = clock
      shader.uniforms.flameAnimate = sway
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 flameUv; uniform float flameTime;' +
            (merged ? '\nattribute float flameTongue; uniform float flameAnimate;' : ''),
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          flameUv = uv;
          transformed.x += sin(uv.y * 7.0 - flameTime * 5.0) * uv.y * uv.y * 0.09;
          transformed.z += sin(uv.y * 5.0 - flameTime * 3.7) * uv.y * uv.y * 0.055;` +
            (merged ? TONGUE_GLSL : ''),
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 flameUv; uniform float flameTime;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float h = flameUv.y;
          float sway = sin(h * 9.0 - flameTime * 8.0) * 0.08 * h;
          float x = abs(flameUv.x - 0.5 - sway);
          float width = max(0.001, (1.0 - h) * 0.38);
          float tongues = sin(flameUv.x * 25.0 + flameTime * 11.0) * 0.07
            + sin(flameUv.x * 43.0 - flameTime * 7.0) * 0.04;
          float edge = 1.0 - smoothstep(width * 0.55, width, x);
          float tip = 1.0 - smoothstep(0.72 + tongues, 0.95 + tongues, h);
          float turbulence = 0.78 + 0.14 * sin(h * 22.0 - flameTime * 10.0 + flameUv.x * 13.0)
            + 0.08 * sin(h * 37.0 - flameTime * 16.0);
          float alpha = edge * tip * smoothstep(0.0, 0.08, h) * turbulence;
          if (alpha < 0.02) discard;
          diffuseColor.rgb = mix(vec3(1.0, 0.82, 0.18), vec3(1.0, 0.13, 0.015), h);
          diffuseColor.a *= alpha * 0.8;`,
        )
    }
    material.customProgramCacheKey = () =>
      merged ? 'vehicle-flames-merged-v1' : 'vehicle-flames-v2'
    flameNodes(material, clock)
    const flames = new THREE.Group()
    flames.name = 'Wreck flames'
    flames.position.y = 0.3
    if (merged) {
      this.mergedFlames ??= mergedFlameGeometry(this.flameGeometry)
      // The shader's `flameAnimate` is the same object the tongue order reads.
      const tongues = new WreckFlames(this.mergedFlames, material, clock, sway)
      flames.add(tongues.mesh)
      return { flames, material, tongues }
    }
    for (let i = 0; i < 6; i++) {
      const tongue = new THREE.Mesh(this.flameGeometry, material)
      tongue.rotation.y = ((i % 2) * Math.PI) / 2
      tongue.position.set((Math.floor(i / 2) - 1) * 0.24, 0, ((i % 3) - 1) * 0.1)
      tongue.scale.set(0.7, 1.0 + (i % 3) * 0.2, 1)
      flames.add(tongue)
    }
    return { flames, material, tongues: undefined }
  }
  /** Compile effect programs during loading and keep them alive across session resets. */
  async warm(
    renderer: Pick<
      THREE.WebGLRenderer,
      'compileAsync' | 'getRenderTarget' | 'setRenderTarget' | 'render' | 'outputColorSpace'
    >,
    scene: THREE.Scene,
    camera: THREE.Camera,
    vehicles: Iterable<THREE.Object3D> = [],
  ): Promise<void> {
    for (const vehicle of vehicles) this.debris.prepare(vehicle)
    const parts = this.debris.warmRoot()
    const balloons = this.balloons.warmMeshes()
    this.root.add(balloons)
    this.root.add(parts)
    this.warmFire ??= this.createFire().fire
    this.warmFlames ??= this.createFlames({ value: 0 })
    this.warmSmoke ??= new ExhaustSmoke(this.space, this.space)
    this.warmSmoke.warmUp(true)
    this.root.add(this.warmFire, this.warmSmoke.root, this.warmFlames.flames)
    try {
      await renderer.compileAsync(scene, camera)
      // A draw also warms transparent front/back passes and uploads effect buffers.
      const target = new THREE.WebGLRenderTarget(1, 1)
      target.texture.colorSpace = renderer.outputColorSpace
      const previous = renderer.getRenderTarget()
      const culled = new Map<THREE.Object3D, boolean>()
      for (const root of [parts, this.warmFire, this.warmSmoke.root, this.warmFlames.flames])
        root.traverse((node) => {
          culled.set(node, node.frustumCulled)
          node.frustumCulled = false
        })
      try {
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
      } finally {
        renderer.setRenderTarget(previous)
        for (const [node, value] of culled) node.frustumCulled = value
        target.dispose()
      }
    } finally {
      balloons.removeFromParent()
      parts.removeFromParent()
      parts.clear()
      this.warmFire.removeFromParent()
      this.warmSmoke.warmUp(false)
      this.warmSmoke.root.removeFromParent()
      this.warmFlames.flames.removeFromParent()
    }
  }
  glass(point: THREE.Vector3, direction: THREE.Vector3): void {
    for (let i = 0; i < SHARDS_PER_PANE; i++) {
      // Past the limit the oldest fragment makes room.
      if (this.shardCount >= MAX_SHARDS) {
        this.shardHead = (this.shardHead + 1) % MAX_SHARDS
        this.shardCount--
      }
      const slot = (this.shardHead + this.shardCount++) % MAX_SHARDS
      const rx = Math.random() * 3 - 1.5,
        ry = Math.random() * 2,
        rz = Math.random() * 3 - 1.5
      this.shardPositions[slot * 3] = point.x
      this.shardPositions[slot * 3 + 1] = point.y
      this.shardPositions[slot * 3 + 2] = point.z
      this.shardVelocities[slot * 3] = direction.x * 1.5 + rx
      this.shardVelocities[slot * 3 + 1] = direction.y * 1.5 + ry
      this.shardVelocities[slot * 3 + 2] = direction.z * 1.5 + rz
      this.shardAges[slot] = 0
    }
  }
  /** Live glass fragments (tests and tools). */
  get shardsAlive(): number {
    return this.shardCount
  }
  update(dt: number, smokeEnabled: boolean, cast?: DebrisCast): void {
    for (const [id, entry] of this.damageSmoke) {
      if (!entry.object.parent) {
        entry.smoke.dispose()
        entry.anchor.removeFromParent()
        this.damageSmoke.delete(id)
        continue
      }
      entry.object.updateWorldMatrix(true, false)
      entry.anchor.position.set(0, 0.15, 0).applyMatrix4(entry.object.matrixWorld)
      this.space.worldToLocal(entry.anchor.position)
      entry.smoke.setEnabled(smokeEnabled)
      entry.smoke.setAmount(entry.amount)
      entry.smoke.update(dt, true, entry.amount)
    }
    dt = THREE.MathUtils.clamp(dt, 0, 0.1)
    this.debris.update(dt, cast)
    this.balloons.update(dt)
    for (let i = this.debrisFires.length - 1; i >= 0; i--) {
      const f = this.debrisFires[i]
      f.clock.value += dt
      f.flames.position.copy(f.anchor.position)
      f.material.opacity = Math.max(0, 1 - f.clock.value / 6)
      f.smoke.setEnabled(smokeEnabled)
      f.smoke.update(dt, f.clock.value < 6, 0.5)
      if (f.clock.value > 9 || !f.anchor.parent) {
        f.flames.removeFromParent()
        f.material.dispose()
        f.smoke.dispose()
        this.debrisFires.splice(i, 1)
      }
    }
    this.light.intensity = 0
    this.flare.intensity.value = 0
    for (const burn of this.burns.values()) {
      burn.object.getWorldPosition(burn.flames.position)
      this.space.worldToLocal(burn.flames.position)
      burn.flames.position.y += 0.3
      burn.age += dt
      burn.clock.value = burn.age
      const intensity =
        burn.age < 0.4
          ? 40 * (1 - burn.age / 0.4)
          : burn.age < explosionTuning.flameSeconds
            ? 5 + Math.sin(burn.age * 17) * 2
            : 0
      if (intensity > this.light.intensity) {
        this.light.intensity = intensity
        burn.fire.getWorldPosition(this.light.position)
        this.space.worldToLocal(this.light.position)
      }
      if (burn.age < 0.25) {
        this.flare.intensity.value = 3 * (1 - burn.age / 0.25)
        burn.fire.getWorldPosition(this.flarePoint)
        this.flarePoint.y += 0.4
      }
      const flash = burn.age < 0.4
      burn.fire.visible = flash
      burn.flames.visible = !flash && burn.age < explosionTuning.flameSeconds
      // Merged tongues sway in the vertex shader from the same age.
      burn.tongues?.updateBounds()
      if (!burn.tongues)
        burn.flames.children.forEach((tongue, i) => {
          const phase = burn.age * (4.5 + i * 0.37) + i * 2.4
          tongue.scale.y =
            (1 + (i % 3) * 0.2) * (0.92 + Math.sin(phase) * 0.13 + Math.sin(phase * 1.7) * 0.05)
          tongue.scale.x = 0.64 + Math.sin(phase * 0.8) * 0.06
        })
      burn.flameMaterial.opacity = Math.max(
        0,
        Math.min(1, (explosionTuning.flameSeconds - burn.age) / 3),
      )
      burn.fire.scale.set(
        flash ? 0.2 + burn.age * 8 : 0.45 + Math.sin(burn.age * 21) * 0.08,
        flash ? 0.2 + burn.age * 8 : 0.8 + Math.sin(burn.age * 17) * 0.15,
        flash ? 0.2 + burn.age * 8 : 0.45,
      )
      burn.fire.material.opacity = flash
        ? 1 - burn.age
        : Math.max(0, Math.min(0.8, (explosionTuning.flameSeconds - burn.age) / 3))
      burn.smoke.setEnabled(smokeEnabled)
      burn.smoke.setAmount(
        Math.min(
          1,
          Math.max(0, (explosionTuning.smokeSeconds - burn.age) / explosionTuning.smokeFadeSeconds),
        ),
      )
      burn.smoke.update(dt, burn.age < explosionTuning.smokeSeconds, 0.8)
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]
      burst.age += dt
      if (burst.age >= 0.4) {
        this.removeBurst(i)
        continue
      }
      burst.clock.value = burst.age
      // Same curve as the vehicle's flash phase (growth, fade, light, lens flare), times `scale`.
      burst.fire.scale.setScalar((0.2 + burst.age * 8) * burst.scale)
      burst.fire.material.opacity = 1 - burst.age
      const intensity = 40 * burst.scale * (1 - burst.age / 0.4)
      if (intensity > this.light.intensity) {
        this.light.intensity = intensity
        this.light.position.copy(burst.fire.position)
      }
      if (burst.age < 0.25) {
        const flare = 3 * burst.scale * (1 - burst.age / 0.25)
        if (flare > this.flare.intensity.value) {
          this.flare.intensity.value = flare
          this.flarePoint.copy(burst.fire.position)
          this.flarePoint.y += 0.4 * burst.scale
        }
      }
    }
    this.updateShards(dt)
  }
  /**
   * Same motion and matrices as the former per-object fragments (age, then `p += v·dt` and
   * `v.y -= 9.8·dt`; rotation `(age·8, index, age·5)`), without allocation. Fragments age in
   * order, so the expired ones are always the oldest at the head of the ring.
   */
  private updateShards(dt: number): void {
    const p = this.shardPositions,
      v = this.shardVelocities,
      ages = this.shardAges
    for (let k = 0; k < this.shardCount; k++) {
      const slot = (this.shardHead + k) % MAX_SHARDS
      ages[slot] += dt
    }
    while (this.shardCount && ages[this.shardHead] > SHARD_LIFE) {
      this.shardHead = (this.shardHead + 1) % MAX_SHARDS
      this.shardCount--
    }
    const dummy = this.shardDummy
    const bounds = this.shardBounds.makeEmpty()
    for (let k = 0; k < this.shardCount; k++) {
      const slot = (this.shardHead + k) % MAX_SHARDS,
        o = slot * 3
      if (ages[slot] > SHARD_LIFE) continue
      p[o] += v[o] * dt
      p[o + 1] += v[o + 1] * dt
      p[o + 2] += v[o + 2] * dt
      v[o + 1] -= 9.8 * dt
    }
    let i = 0
    for (let k = 0; k < this.shardCount; k++) {
      const slot = (this.shardHead + k) % MAX_SHARDS,
        o = slot * 3
      if (ages[slot] > SHARD_LIFE) continue
      dummy.position.set(p[o], p[o + 1], p[o + 2])
      dummy.rotation.set(ages[slot] * 8, i, ages[slot] * 5)
      dummy.updateMatrix()
      this.fragments.setMatrixAt(i, dummy.matrix)
      bounds.expandByPoint(dummy.position)
      i++
    }
    if (i) bounds.expandByScalar(SHARD_RADIUS)
    this.fragments.count = i
    // Upload only the live matrices; nothing at all while no glass is flying.
    if (i) {
      this.fragments.instanceMatrix.addUpdateRange(0, i * 16)
      this.fragments.instanceMatrix.needsUpdate = true
    }
  }
  private remove(id: string): void {
    const burn = this.burns.get(id)
    if (!burn) return
    burn.fire.removeFromParent()
    burn.flames.removeFromParent()
    burn.fire.material.dispose()
    burn.flameMaterial.dispose()
    burn.smoke.dispose()
    this.burns.delete(id)
  }
  clear(): void {
    for (const entry of this.damageSmoke.values()) {
      entry.smoke.dispose()
      entry.anchor.removeFromParent()
    }
    this.damageSmoke.clear()
    this.balloons.clear()
    while (this.bursts.length) this.removeBurst(0)
    for (const [part, visible] of this.hiddenWreckParts) part.visible = visible
    this.hiddenWreckParts.clear()
    this.debris.clear()
    for (const f of this.debrisFires) {
      f.flames.removeFromParent()
      f.material.dispose()
      f.smoke.dispose()
    }
    this.debrisFires.length = 0
    for (const [material, saved] of this.charred) {
      if (saved.color && 'color' in material && material.color instanceof THREE.Color)
        material.color.copy(saved.color)
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.copy(saved.emissive!)
        material.emissiveIntensity = saved.emissiveIntensity!
        material.roughness = saved.roughness!
        material.metalness = saved.metalness!
      }
      if (saved.flag === undefined) delete material.userData.nablaCharred
      else material.userData.nablaCharred = saved.flag
    }
    this.charred.clear()
    for (const id of this.burns.keys()) this.remove(id)
    this.shardHead = this.shardCount = 0
    this.shardBounds.makeEmpty()
    this.fragments.count = 0
    this.light.intensity = 0
    this.flare.intensity.value = 0
  }
  dispose(): void {
    this.clear()
    this.debris.dispose()
    this.balloons.dispose()
    this.root.removeFromParent()
    this.light.removeFromParent()
    this.flare.mesh.removeFromParent()
    this.flare.dispose()
    for (const fire of this.burstPool) fire.material.dispose()
    this.burstPool.length = 0
    this.warmFire?.material.dispose()
    this.warmFlames?.material.dispose()
    this.warmSmoke?.dispose()
    this.geometry.dispose()
    this.flameGeometry.dispose()
    this.mergedFlames?.dispose()
    this.fragments.geometry.dispose()
    ;(this.fragments.material as THREE.Material).dispose()
  }
}
