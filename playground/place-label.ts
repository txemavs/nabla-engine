import * as THREE from 'three'
/** Camera-facing text, with its texture explicitly owned by this sprite. */
export function placeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = '600 30px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 6
  ctx.strokeStyle = '#17212a'
  ctx.fillStyle = '#f5f3e9'
  ctx.strokeText(text, 256, 32, 490)
  ctx.fillText(text, 256, 32, 490)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  )
  label.scale.set(0.32, 0.04, 1)
  label.userData.ownedLabelTexture = true
  label.raycast = () => undefined
  label.renderOrder = 100
  return label
}
