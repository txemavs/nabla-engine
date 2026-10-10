import * as THREE from 'three'

/** The anniversary swatch paints the front red and the rear silver, as requested by the owner. */
export const vfrAnniversaryColor = '#c51b28'

/** Paint authored motorcycle zones without changing fixed metal, lenses, tyres or trim. */
export function paintMotorcycle(model: THREE.Object3D, color: string): void {
  const selected = color.toLowerCase()
  const anniversary = selected === vfrAnniversaryColor
  const white = selected === '#f0f0ea'
  const greyRims = selected === '#aab0b7' || selected === '#2157a5'
  const rim = white ? '#f0f0ea' : greyRims ? '#aab0b7' : '#17191e'
  const redStripe = selected === '#17191e'
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    for (const material of [object.material].flat()) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      const authored = material.userData.nabla
      if (authored?.paintZone === 'rim') material.color.set(rim)
      else if (authored?.paintZone === 'rim-stripe') {
        material.color.set(redStripe ? '#ba1827' : rim)
        material.emissive.set(redStripe ? '#ba1827' : '#000000')
        material.emissiveIntensity = redStripe ? 0.15 : 0
      } else if (authored?.paint) {
        material.color.set(anniversary && authored.paintZone === 'tail' ? '#aab0b7' : color)
      }
    }
  })
}
