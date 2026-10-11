import * as THREE from 'three'
import { ExhaustSmoke } from './exhaust-smoke.js'

/** Bounded, reusable explosions, burning wrecks and glass fragments in the scene frame. */
export class VehicleDestruction {
  private readonly charred = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  readonly root = new THREE.Group()
  readonly glassRoot = new THREE.Group()
  private readonly geometry = new THREE.SphereGeometry(1, 10, 8)
  private readonly burns = new Map<
    string,
    {
      object: THREE.Object3D
      fire: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
      smoke: ExhaustSmoke
      age: number
      clock: { value: number }
      light: THREE.PointLight
    }
  >()
  private readonly fragments = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.035),
    new THREE.MeshBasicMaterial({ color: '#b8e5ff', transparent: true, opacity: 0.65 }),
    96,
  )
  private readonly shards: { position: THREE.Vector3; velocity: THREE.Vector3; age: number }[] = []
  constructor(private readonly space: THREE.Group) {
    this.root.name = 'Vehicle explosions'
    this.fragments.count = 0
    this.fragments.frustumCulled = false
    this.root.add(this.fragments, this.glassRoot)
  }
  explode(id: string, object: THREE.Object3D): void {
    if (this.burns.has(id)) return
    if (this.burns.size >= 32) this.remove(this.burns.keys().next().value!)
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || this.charred.has(node)) return
      this.charred.set(node, node.material)
      const materials = (Array.isArray(node.material) ? node.material : [node.material]).map(
        (material) => {
          const clone = material.clone()
          if (clone instanceof THREE.MeshStandardMaterial) {
            clone.color.multiplyScalar(0.22)
            clone.emissive.set(0)
            clone.roughness = 0.95
            clone.metalness = 0.1
          }
          return clone
        },
      )
      node.material = Array.isArray(node.material) ? materials : materials[0]
    })
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
    const light = new THREE.PointLight('#ff9b22', 20, 8, 2)
    light.position.y = 0.5
    fire.position.y = 0.5
    const smoke = new ExhaustSmoke(object, this.space, {
      direction: [0, 1, 0],
      color: '#222222',
      size: 900,
    })
    object.add(fire, light)
    this.root.add(smoke.root)
    this.burns.set(id, { object, fire, smoke, age: 0, clock, light })
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
  update(dt: number, smokeEnabled: boolean): void {
    dt = THREE.MathUtils.clamp(dt, 0, 0.1)
    for (const burn of this.burns.values()) {
      burn.age += dt
      burn.clock.value = burn.age
      burn.light.intensity =
        burn.age < 0.4
          ? 40 * (1 - burn.age / 0.4)
          : burn.age < 12
            ? 5 + Math.sin(burn.age * 17) * 2
            : 0
      const flash = burn.age < 0.4
      burn.fire.visible = burn.age < 12
      burn.fire.scale.set(
        flash ? 0.2 + burn.age * 8 : 0.45 + Math.sin(burn.age * 21) * 0.08,
        flash ? 0.2 + burn.age * 8 : 0.8 + Math.sin(burn.age * 17) * 0.15,
        flash ? 0.2 + burn.age * 8 : 0.45,
      )
      burn.fire.material.opacity = flash
        ? 1 - burn.age
        : Math.max(0, Math.min(0.8, (12 - burn.age) / 3))
      burn.smoke.setEnabled(smokeEnabled)
      burn.smoke.update(dt, burn.age < 12, 0.8)
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
    burn.light.removeFromParent()
    burn.fire.material.dispose()
    burn.smoke.dispose()
    this.burns.delete(id)
  }
  clear(): void {
    for (const [mesh, original] of this.charred) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        material.dispose()
      mesh.material = original
    }
    this.charred.clear()
    for (const id of this.burns.keys()) this.remove(id)
    this.shards.length = 0
    this.fragments.count = 0
  }
  dispose(): void {
    this.clear()
    this.root.removeFromParent()
    this.geometry.dispose()
    this.fragments.geometry.dispose()
    ;(this.fragments.material as THREE.Material).dispose()
  }
}
