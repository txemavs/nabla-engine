import { TrunkBalloons } from './trunk-balloons.js'
import { WreckDebris, type DebrisCast } from './wreck-debris.js'
import * as THREE from 'three'
import { ExhaustSmoke } from './exhaust-smoke.js'
import { createLensFlare } from '../planet/lens-flare.js'

/** Bounded, reusable explosions, burning wrecks and glass fragments in the scene frame. */
export class VehicleDestruction {
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
    clock: { value: number }
    smoke: ExhaustSmoke
  }[] = []
  readonly root = new THREE.Group()
  readonly glassRoot = new THREE.Group()
  private readonly geometry = new THREE.SphereGeometry(1, 10, 8)
  private readonly flameGeometry = new THREE.PlaneGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
  // Keep the light count constant: adding the first explosion lamp otherwise recompiles
  // every lit material in the scene on the gameplay frame.
  private readonly light = new THREE.PointLight('#ff9b22', 0, 8, 2)
  private warmFire?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  private warmSmoke?: ExhaustSmoke
  private warmFlames?: ReturnType<VehicleDestruction['createFlames']>
  private readonly burns = new Map<
    string,
    {
      object: THREE.Object3D
      fire: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
      flames: THREE.Group
      flameMaterial: THREE.MeshBasicMaterial
      smoke: ExhaustSmoke
      age: number
      clock: { value: number }
    }
  >()
  private readonly fragments = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.035),
    new THREE.MeshBasicMaterial({ color: '#b8e5ff', transparent: true, opacity: 0.65 }),
    96,
  )
  private readonly shards: { position: THREE.Vector3; velocity: THREE.Vector3; age: number }[] = []
  constructor(private readonly space: THREE.Group) {
    this.debris = new WreckDebris(space)
    this.balloons = new TrunkBalloons(space)
    this.root.name = 'Vehicle explosions'
    this.fragments.count = 0
    this.fragments.frustumCulled = false
    this.root.add(this.fragments, this.glassRoot)
    this.space.add(this.light)
    this.flare.intensity.value = 0
    this.flare.mesh.name = 'Explosion lens flare'
    this.space.add(this.flare.mesh)
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
        { flames, material } = this.createFlames(clock)
      flames.scale.setScalar(0.28)
      this.space.add(flames)
      flames.position.copy(anchor.position)
      const smoke = new ExhaustSmoke(flames, this.space, {
        direction: [0, 1, 0],
        color: '#292522',
        size: 250,
      })
      this.root.add(smoke.root)
      this.debrisFires.push({ anchor, flames, material, clock, smoke })
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
    const { flames, material: flameMaterial } = this.createFlames(clock)
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
    this.burns.set(id, { object, fire, flames, flameMaterial, smoke, age: 0, clock })
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
    return { fire, clock }
  }
  private createFlames(clock: { value: number }) {
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.flameTime = clock
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 flameUv; uniform float flameTime;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          flameUv = uv;
          transformed.x += sin(uv.y * 7.0 - flameTime * 5.0) * uv.y * uv.y * 0.09;
          transformed.z += sin(uv.y * 5.0 - flameTime * 3.7) * uv.y * uv.y * 0.055;`,
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
    material.customProgramCacheKey = () => 'vehicle-flames-v2'
    const flames = new THREE.Group()
    flames.name = 'Wreck flames'
    flames.position.y = 0.3
    for (let i = 0; i < 6; i++) {
      const tongue = new THREE.Mesh(this.flameGeometry, material)
      tongue.rotation.y = ((i % 2) * Math.PI) / 2
      tongue.position.set((Math.floor(i / 2) - 1) * 0.24, 0, ((i % 3) - 1) * 0.1)
      tongue.scale.set(0.7, 1.0 + (i % 3) * 0.2, 1)
      flames.add(tongue)
    }
    return { flames, material }
  }
  /** Compile effect programs during loading and keep them alive across session resets. */
  async warm(
    renderer: Pick<THREE.WebGLRenderer, 'compileAsync'>,
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
    this.warmSmoke.root.visible = true
    this.root.add(this.warmFire, this.warmSmoke.root, this.warmFlames.flames)
    try {
      await renderer.compileAsync(scene, camera)
    } finally {
      balloons.removeFromParent()
      parts.removeFromParent()
      parts.clear()
      this.warmFire.removeFromParent()
      this.warmSmoke.root.removeFromParent()
      this.warmFlames.flames.removeFromParent()
    }
  }
  glass(point: THREE.Vector3, direction: THREE.Vector3): void {
    for (let i = 0; i < 24; i++) {
      if (this.shards.length >= 96) this.shards.shift()
      this.shards.push({
        position: point.clone(),
        velocity: direction
          .clone()
          .multiplyScalar(1.5)
          .add(
            new THREE.Vector3(Math.random() * 3 - 1.5, Math.random() * 2, Math.random() * 3 - 1.5),
          ),
        age: 0,
      })
    }
  }
  update(dt: number, smokeEnabled: boolean, cast?: DebrisCast): void {
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
          : burn.age < 12
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
      burn.flames.visible = !flash && burn.age < 12
      burn.flames.children.forEach((tongue, i) => {
        const phase = burn.age * (4.5 + i * 0.37) + i * 2.4
        tongue.scale.y =
          (1 + (i % 3) * 0.2) * (0.92 + Math.sin(phase) * 0.13 + Math.sin(phase * 1.7) * 0.05)
        tongue.scale.x = 0.64 + Math.sin(phase * 0.8) * 0.06
      })
      burn.flameMaterial.opacity = Math.max(0, Math.min(1, (12 - burn.age) / 3))
      burn.fire.scale.set(
        flash ? 0.2 + burn.age * 8 : 0.45 + Math.sin(burn.age * 21) * 0.08,
        flash ? 0.2 + burn.age * 8 : 0.8 + Math.sin(burn.age * 17) * 0.15,
        flash ? 0.2 + burn.age * 8 : 0.45,
      )
      burn.fire.material.opacity = flash
        ? 1 - burn.age
        : Math.max(0, Math.min(0.8, (12 - burn.age) / 3))
      burn.smoke.setEnabled(smokeEnabled)
      burn.smoke.setAmount(Math.min(1, Math.max(0, (45 - burn.age) / 15)))
      burn.smoke.update(dt, burn.age < 45, 0.8)
    }
    const dummy = new THREE.Object3D()
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const shard = this.shards[i]
      shard.age += dt
      if (shard.age > 1.5) {
        this.shards.splice(i, 1)
        continue
      }
      shard.position.addScaledVector(shard.velocity, dt)
      shard.velocity.y -= 9.8 * dt
    }
    this.fragments.count = this.shards.length
    this.shards.forEach((shard, i) => {
      dummy.position.copy(shard.position)
      dummy.rotation.set(shard.age * 8, i, shard.age * 5)
      dummy.updateMatrix()
      this.fragments.setMatrixAt(i, dummy.matrix)
    })
    this.fragments.instanceMatrix.needsUpdate = true
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
    this.balloons.clear()
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
    this.shards.length = 0
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
    this.warmFire?.material.dispose()
    this.warmFlames?.material.dispose()
    this.warmSmoke?.dispose()
    this.geometry.dispose()
    this.flameGeometry.dispose()
    this.fragments.geometry.dispose()
    ;(this.fragments.material as THREE.Material).dispose()
  }
}
