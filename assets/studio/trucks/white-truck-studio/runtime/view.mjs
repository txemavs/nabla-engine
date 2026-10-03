/** Three.js view. Physics state is read from the rig; meshes do not own physics. */
export async function createRigView(THREE, GLTFLoader, scene, rig, baseUrl) {
  const loader = new GLTFLoader()
  const entries = []
  const materials = new Set()
  const geometries = new Set()
  async function load(asset) {
    const result = await loader.loadAsync(new URL(asset, baseUrl).href)
    result.scene.traverse((object) => {
      if (!object.isMesh) return
      geometries.add(object.geometry)
      const list = Array.isArray(object.material) ? object.material : [object.material]
      list.forEach((material) => {
        materials.add(material)
        if (material.transparent) material.depthWrite = false
      })
      object.castShadow = list.every((material) => !material.transparent)
      object.receiveShadow = true
    })
    return result.scene
  }
  for (const vehicle of [rig.tractor, rig.trailer].filter(Boolean)) {
    const root = await load(vehicle.config.body)
    scene.add(root)
    const wheels = []
    for (const spec of vehicle.config.wheels) {
      const wheel = new THREE.Group()
      const orientation = new THREE.Group()
      orientation.rotation.y = spec.rotationY
      orientation.add(await load(spec.asset))
      wheel.add(orientation)
      scene.add(wheel)
      wheels.push(wheel)
    }
    let steering = null
    const spec = vehicle.config.steeringWheel
    if (spec) {
      steering = new THREE.Group()
      steering.position.fromArray(spec.position)
      steering.add(await load(spec.asset))
      root.add(steering)
    }
    const supports = new THREE.Group()
    for (const shape of vehicle.config.landingGear ?? []) {
      const geometry = new THREE.BoxGeometry(...shape.size)
      const material = new THREE.MeshStandardMaterial({ color: 0x343b44 })
      geometries.add(geometry)
      materials.add(material)
      const support = new THREE.Mesh(geometry, material)
      support.position.fromArray(shape.position)
      support.castShadow = true
      supports.add(support)
    }
    root.add(supports)
    entries.push({ vehicle, root, wheels, steering, supports })
  }
  const axisY = new THREE.Vector3(0, 1, 0)
  const axisX = new THREE.Vector3(1, 0, 0)
  const steerQuaternion = new THREE.Quaternion()
  const spinQuaternion = new THREE.Quaternion()
  const local = new THREE.Vector3()
  function update(input = {}, time = 0) {
    for (const entry of entries) {
      const { vehicle, root, wheels, steering, supports } = entry
      root.position.copy(vehicle.body.translation())
      root.quaternion.copy(vehicle.body.rotation())
      wheels.forEach((wheel, i) => {
        local.fromArray(vehicle.config.wheels[i].hub)
        const length = vehicle.controller.wheelSuspensionLength(i) ?? vehicle.config.suspensionRest
        local.y += vehicle.config.suspensionRest - length
        wheel.position.copy(local).applyQuaternion(root.quaternion).add(root.position)
        steerQuaternion.setFromAxisAngle(axisY, vehicle.controller.wheelSteering(i) ?? 0)
        spinQuaternion.setFromAxisAngle(axisX, vehicle.controller.wheelRotation(i) ?? 0)
        wheel.quaternion.copy(root.quaternion).multiply(steerQuaternion).multiply(spinQuaternion)
      })
      if (steering) {
        const spec = vehicle.config.steeringWheel
        steering.quaternion.setFromAxisAngle(
          new THREE.Vector3(...spec.axis),
          (vehicle.steer / 0.42) * spec.maxAngle,
        )
      }
      supports.visible = !rig.telemetry().coupled
    }
    for (const material of materials) {
      if (material.name === 'Headlamp') material.emissiveIntensity = input.lights ? 4 : 0.2
      if (material.name === 'Tail_stop')
        material.emissiveIntensity = input.brake || input.parkingBrake ? 5 : 1
      if (material.name === 'Indicator')
        material.emissiveIntensity = input.hazards && Math.sin(time * 7) > 0 ? 6 : 0.2
    }
  }
  function dispose() {
    entries.forEach((entry) => {
      scene.remove(entry.root)
      entry.wheels.forEach((wheel) => scene.remove(wheel))
    })
    materials.forEach((material) => material.dispose())
    geometries.forEach((geometry) => geometry.dispose())
  }
  update()
  return { entries, update, dispose }
}
