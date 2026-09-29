import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import * as T from 'three'
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js'

/** Lightweight Bilbao markings and emissive lightbar; no shadow lights or reflection cameras. */
export class PoliceEquipment {
  readonly textures: T.Texture[] = []
  private lamps: T.MeshStandardMaterial[] = []
  constructor(model: T.Group) {
    const paint = model.getObjectByName('MAT_Ford_FocusRS_2016_Base') as T.Mesh
    const surface = paint?.isMesh ? new T.Mesh(paint.geometry) : null
    if (surface) {
      // Prepared paint geometry is in vehicle/model space; project before the COM/world pose.
      surface.updateMatrixWorld()
      for (const side of [-1, 1]) {
        this.decal(
          model,
          surface,
          this.side(side),
          [side * 0.92, 0.79, 0],
          [0, (side * Math.PI) / 2, 0],
          [3.8, 0.46, 0.55],
        )
        this.decal(
          model,
          surface,
          this.stripes(),
          [side * 0.88, 0.38, 0],
          [0, (side * Math.PI) / 2, 0],
          [2.45, 0.1, 0.4],
        )
      }
      this.decal(
        model,
        surface,
        this.text('UDALTZAINGOA', 'Bilbao'),
        [0, 0.78, 2.08],
        [0, 0, 0],
        [1.25, 0.26, 0.5],
      )
      this.decal(
        model,
        surface,
        this.text('POLIZIA', 'Bilbao'),
        [0, 1.12, -1.6],
        [-Math.PI / 2, 0, Math.PI],
        [1.15, 0.58, 0.55],
      )
    }
    const box = (size: number[], position: number[], material: T.MeshStandardMaterial) => {
      const mesh = new T.Mesh(
        new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(0.04, Math.min(...size) / 3)),
        material,
      )
      mesh.position.fromArray(position)
      model.add(mesh)
      return mesh
    }
    const dark = new T.MeshStandardMaterial({ color: '#202630', roughness: 0.65 })
    const barZ = 0.42
    const feet = [-0.42, 0.42].map((x) => ({
      x,
      roof: surface
        ? (new T.Raycaster(new T.Vector3(x, 3, barZ), new T.Vector3(0, -1, 0)).intersectObject(
            surface,
            false,
          )[0]?.point.y ?? 1.46)
        : 1.46,
    }))
    const baseY = Math.max(...feet.map((foot) => foot.roof)) + 0.07
    for (const { x, roof } of feet) {
      const bottom = roof - 0.008,
        top = baseY - 0.018
      box([0.09, top - bottom, 0.24], [x, (top + bottom) / 2, barZ], dark)
    }
    box([1.12, 0.045, 0.28], [0, baseY, barZ], dark)
    for (const x of [-0.36, 0.36]) {
      const material = new T.MeshStandardMaterial({
        color: '#146bd3',
        emissive: '#007bff',
        emissiveIntensity: 0.4,
        roughness: 0.25,
      })
      this.lamps.push(material)
      box([0.36, 0.09, 0.27], [x, baseY + 0.055, barZ], material)
    }
    box(
      [0.35, 0.09, 0.27],
      [0, baseY + 0.055, barZ],
      new T.MeshStandardMaterial({ color: '#dbe7ef', roughness: 0.4 }),
    )
  }
  update(now: number, active: boolean): void {
    const phase = Math.floor(now / 130) % 6
    this.lamps.forEach(
      (lamp, i) =>
        (lamp.emissiveIntensity = active && (phase === i * 3 || phase === i * 3 + 2) ? 5 : 0.2),
    )
  }
  private canvas(draw: (ctx: CanvasRenderingContext2D) => void): T.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    draw(canvas.getContext('2d')!)
    const texture = new T.CanvasTexture(canvas)
    texture.colorSpace = T.SRGBColorSpace
    texture.anisotropy = 4
    this.textures.push(texture)
    return texture
  }
  private side(side: number): T.Texture {
    return this.canvas((c) => {
      c.fillStyle = '#0752bd'
      c.fillRect(0, 58, 1024, 140)
      c.fillStyle = 'white'
      c.font = 'bold 84px Arial'
      c.textAlign = 'center'
      c.fillText('POLIZIA', side < 0 ? 650 : 390, 157)
      const x = side < 0 ? 185 : 765
      c.fillStyle = 'white'
      c.fillRect(x - 95, 48, 230, 160)
      c.fillStyle = '#cf172c'
      c.beginPath()
      c.ellipse(x - 52, 125, 40, 66, 0, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = 'white'
      c.font = 'bold 86px Arial'
      c.fillText('B', x - 52, 157)
      c.fillStyle = '#cf172c'
      c.font = 'bold 68px Arial'
      c.textAlign = 'left'
      c.fillText('ilbao', x - 17, 153)
    })
  }
  private stripes(): T.Texture {
    return this.canvas((c) => {
      c.fillStyle = 'white'
      c.fillRect(0, 0, 1024, 256)
      c.fillStyle = '#cc2030'
      for (let x = -40; x < 1100; x += 110) {
        c.beginPath()
        c.moveTo(x, 0)
        c.lineTo(x + 50, 0)
        c.lineTo(x + 105, 256)
        c.lineTo(x + 55, 256)
        c.fill()
      }
    })
  }
  private text(top: string, bottom: string): T.Texture {
    return this.canvas((c) => {
      c.fillStyle = '#0752bd'
      c.fillRect(0, 0, 1024, 256)
      c.fillStyle = 'white'
      c.textAlign = 'center'
      c.font = 'bold 85px Arial'
      c.fillText(top, 512, 111)
      c.font = 'bold 68px Arial'
      c.fillText(bottom, 512, 209)
    })
  }
  private decal(
    model: T.Group,
    surface: T.Mesh,
    map: T.Texture,
    position: number[],
    rotation: number[],
    size: number[],
  ): void {
    const geometry = new DecalGeometry(
      surface,
      new T.Vector3(...(position as [number, number, number])),
      new T.Euler(...(rotation as [number, number, number])),
      new T.Vector3(...(size as [number, number, number])),
    )
    // Polygon offset alone cannot reliably separate coplanar surfaces with logarithmic depth.
    // Lift the markings 3 mm along the body normals, then use an opaque alpha cutout
    // so overlapping projected triangles cannot repeatedly blend over one another.
    const positions = geometry.getAttribute('position'),
      normals = geometry.getAttribute('normal')
    const normal = new T.Vector3()
    for (let i = 0; i < positions.count; i++) {
      normal.fromBufferAttribute(normals, i).normalize().multiplyScalar(0.003)
      positions.setXYZ(
        i,
        positions.getX(i) + normal.x,
        positions.getY(i) + normal.y,
        positions.getZ(i) + normal.z,
      )
    }
    positions.needsUpdate = true
    geometry.computeBoundingSphere()
    const material = new T.MeshStandardMaterial({
      map,
      alphaTest: 0.1,
      depthWrite: true,
      roughness: 0.55,
    })
    const mesh = new T.Mesh(geometry, material)
    mesh.renderOrder = 2
    model.add(mesh)
  }
}
