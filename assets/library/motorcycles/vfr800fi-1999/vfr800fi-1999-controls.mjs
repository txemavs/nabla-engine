import { Vector3, Quaternion } from 'three'

/** Visual kinematics only. Inputs come from the future fixed-step motorcycle simulation. */
export function bindInterceptor(root, rig) {
  const get = (name) => {
    const o = root.getObjectByName(name)
    if (!o) throw Error(`Missing Interceptor node: ${name}`)
    return o
  }
  const steering = get('Steering_Pivot'),
    fork = get('Fork_Slider'),
    arm = get('Swingarm_Pivot'),
    front = get('Wheel_Front'),
    rear = get('Wheel_Rear'),
    shockBody = get('Shock_Body'),
    shockRod = get('Shock_Rod'),
    chain = get('Chain')
  chain.geometry = chain.geometry.clone()
  const restFork = fork.position.clone(),
    restRear = rear.position.clone(),
    restRod = shockRod.position.clone(),
    restShock = restRod.clone().sub(shockBody.position).normalize()
  const chainPositions = chain.geometry.getAttribute('position'),
    originalChain = chainPositions.array.slice(),
    steerAxis = new Vector3(...rig.front.axis).normalize()
  const rearAttach = new Vector3(...rig.rear.shock.lower).sub(
      new Vector3(...rig.rear.swingarmPivot),
    ),
    top = new Vector3(...rig.rear.shock.upper),
    rearHub = new Vector3(...rig.rear.hub),
    frontSprocket = rig.chain.frontSprocket[2],
    rearSprocket = rig.chain.rearSprocket[2]
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
  function update({
    steeringAngle = 0,
    frontCompression = 0,
    rearCompression = 0,
    frontRoll = 0,
    rearRoll = 0,
  } = {}) {
    for (const v of [steeringAngle, frontCompression, rearCompression, frontRoll, rearRoll])
      if (!Number.isFinite(v)) throw Error('Non-finite motorcycle pose')
    steering.quaternion.setFromAxisAngle(
      steerAxis,
      clamp(steeringAngle, -rig.front.steerLimit, rig.front.steerLimit),
    )
    fork.position
      .copy(restFork)
      .addScaledVector(steerAxis, clamp(frontCompression, -0.03, rig.front.travel))
    const L = Math.hypot(restRear.y, restRear.z),
      theta =
        Math.asin(
          clamp((restRear.y + clamp(rearCompression, -0.03, rig.rear.compression)) / L, -1, 1),
        ) - Math.atan2(restRear.y, restRear.z)
    arm.quaternion.setFromAxisAngle(new Vector3(-1, 0, 0), theta)
    front.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), frontRoll)
    rear.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), rearRoll)
    const lower = rearAttach.clone().applyQuaternion(arm.quaternion).add(arm.position),
      currentAxis = lower.clone().sub(top).normalize(),
      q = new Quaternion().setFromUnitVectors(restShock, currentAxis)
    shockBody.quaternion.copy(q)
    shockRod.quaternion.copy(q)
    shockRod.position.copy(lower)
    const movedHub = restRear.clone().applyQuaternion(arm.quaternion).add(arm.position),
      delta = movedHub.sub(rearHub)
    for (let k = 0; k < chainPositions.count; k++) {
      const t = clamp(
        (originalChain[k * 3 + 2] - frontSprocket) / (rearSprocket - frontSprocket),
        0,
        1,
      )
      chainPositions.setXYZ(
        k,
        originalChain[k * 3] + delta.x * t,
        originalChain[k * 3 + 1] + delta.y * t,
        originalChain[k * 3 + 2] + delta.z * t,
      )
    }
    chainPositions.needsUpdate = true
    chain.geometry.computeBoundingSphere()
    root.updateMatrixWorld(true)
    return {
      steeringAngle: clamp(steeringAngle, -rig.front.steerLimit, rig.front.steerLimit),
      swingarmAngle: theta,
      shockLength: lower.distanceTo(top),
    }
  }
  update()
  return { update }
}
