import { DirectionalLight, Vector3 } from 'three'

/** One bounded shadow map following the viewer. Snap in light space to avoid crawling
 * edges as the camera moves; coordinates here already include the floating origin. */
export class FollowingShadows {
  private readonly right = new Vector3()
  private readonly up = new Vector3()
  private readonly direction = new Vector3()
  private readonly center = new Vector3()
  update(light: DirectionalLight, eye: Vector3, towardLight: Vector3, radius: number): void {
    this.direction.copy(towardLight).normalize()
    this.up.set(
      0,
      Math.abs(this.direction.y) > 0.99 ? 0 : 1,
      Math.abs(this.direction.y) > 0.99 ? 1 : 0,
    )
    this.right.crossVectors(this.up, this.direction).normalize()
    this.up.crossVectors(this.direction, this.right).normalize()
    const texel = (2 * radius) / light.shadow.mapSize.x
    light.shadow.bias = radius <= 55 ? -0.00002 : -0.0001
    light.shadow.normalBias = radius <= 55 ? 0.025 : Math.max(0.035, texel * 0.35)
    this.center.copy(eye)
    this.center.addScaledVector(
      this.right,
      Math.round(eye.dot(this.right) / texel) * texel - eye.dot(this.right),
    )
    this.center.addScaledVector(
      this.up,
      Math.round(eye.dot(this.up) / texel) * texel - eye.dot(this.up),
    )
    light.target.position.copy(this.center)
    light.position.copy(this.center).addScaledVector(this.direction, radius * 2 + 200)
    light.target.updateMatrixWorld(true)
    light.updateMatrixWorld(true)
    const camera = light.shadow.camera
    if (camera.right !== radius) {
      camera.left = camera.bottom = -radius
      camera.right = camera.top = radius
      camera.near = 1
      camera.far = radius * 4 + 400
      camera.updateProjectionMatrix()
    }
  }
}
