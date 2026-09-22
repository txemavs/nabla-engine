import * as THREE from 'three'
export interface CarLampState {
  powered: boolean
  braking: boolean
  reversing: boolean
}
/** Original GLB lenses; no extra lights, shadows or scene passes. */
export class CarLights {
  private lamps: {
    material: THREE.MeshStandardMaterial
    kind: 'position' | 'brake' | 'reverse' | 'signal'
    side: number
    mesh?: THREE.Mesh
  }[] = []
  private signal = 0
  constructor(model: THREE.Object3D) {
    model.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial)
      )
        return
      const material = object.material
      let node: THREE.Object3D | null = object
      const ancestors: string[] = []
      while (node && node !== model) {
        ancestors.push(node.name.replaceAll('_', ' ').toLowerCase())
        node = node.parent
      }
      const rearSide = ancestors.some((n) => n === 'luz izquierda' || n === 'luz derecha')
      const trunk = ancestors.includes('luces maletero')
      const right = ancestors.includes('luz derecha')
      if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
        this.lamps.push({ material, kind: 'position', side: 0 })
        material.emissiveIntensity = 0
      }
      if (rearSide && material.name === 'Rojo 6')
        this.masked(material, 'brake', '#ff0800', `${right ? '-' : ''}vLampPosition.y < 0.075`, 0)
      if (trunk && material.name === 'PilotoRojo')
        this.masked(material, 'reverse', '#ffffff', 'vLampPosition.y < 0.055', 0)
      // Independent upper amber strips, selected manually; the lower lens never flashes.
      if ((rearSide || trunk) && material.name === 'Rojo 6') {
        const source = object.geometry
        const pos = source.getAttribute('position'),
          index = source.getIndex()
        const indices: number[] = []
        for (let i = 0; i < (index?.count ?? pos.count); i += 3) {
          const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j))
          const y = (ids.reduce((sum, id) => sum + pos.getY(id), 0) / 3) * (right ? -1 : 1)
          if (rearSide && y <= 0.078) continue
          indices.push(...ids)
        }
        if (!indices.length) return
        const geometry = source.clone()
        geometry.setIndex(indices)
        const lamp = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: '#36210c',
            emissive: '#ff7300',
            emissiveIntensity: 0,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        )
        object.add(lamp)
        // Trunk has both strips in one primitive; use local X to address each half.
        if (trunk) {
          this.masked(lamp.material, 'signal', '#ff7300', 'vLampPosition.x < 0.552', 1)
          const other = new THREE.Mesh(geometry.clone(), lamp.material.clone())
          object.add(other)
          this.masked(other.material, 'signal', '#ff7300', 'vLampPosition.x >= 0.552', -1)
          this.lamps[this.lamps.length - 2].mesh = lamp
          this.lamps[this.lamps.length - 1].mesh = other
        } else
          this.lamps.push({
            material: lamp.material,
            kind: 'signal',
            side: right ? 1 : -1,
            mesh: lamp,
          })
        lamp.visible = false
      }
    })
  }
  private masked(
    material: THREE.MeshStandardMaterial,
    kind: 'brake' | 'reverse' | 'signal',
    color: string,
    condition: string,
    side: number,
  ): void {
    material.emissive.set(color)
    material.emissiveIntensity = 0
    material.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 vLampPosition;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvLampPosition = position;',
        )
      shader.fragmentShader =
        'varying vec3 vLampPosition;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\nif (!(${condition})) ${kind === 'signal' ? 'discard;' : 'totalEmissiveRadiance = vec3(0.0);'}`,
        )
    }
    material.customProgramCacheKey = () => `a3-lamp:${kind}:${condition}`
    this.lamps.push({ material, kind, side })
  }
  toggle(side: number): void {
    this.signal = this.signal === side ? 0 : side
  }
  update(state: CarLampState, now: number): void {
    if (!state.powered) this.signal = 0
    const flash = Math.floor(now / 450) % 2 === 0
    for (const lamp of this.lamps) {
      lamp.material.emissiveIntensity = !state.powered
        ? 0
        : lamp.kind === 'position'
          ? 0.65
          : lamp.kind === 'brake'
            ? state.braking
              ? 3
              : 0
            : lamp.kind === 'reverse'
              ? state.reversing
                ? 2
                : 0
              : this.signal === lamp.side && flash
                ? 2
                : 0
      if (lamp.mesh) lamp.mesh.visible = lamp.material.emissiveIntensity > 0
    }
  }
}
