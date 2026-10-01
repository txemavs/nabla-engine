import * as THREE from 'three'
import { eclipticDirection, equatorialDirection } from '../../math/geo/sphere.js'

const STAR_RADIUS = 80000
const PLANET_DISTANCE = 52000

/** Right ascension in hours, declination in degrees. The figures are the stars alone. */
type Figure = { stars: [number, number][] }

const FIGURES: Figure[] = [
  {
    stars: [
      [11.062, 61.75],
      [11.03, 56.38],
      [11.897, 53.69],
      [12.257, 57.03],
      [12.9, 55.96],
      [13.398, 54.93],
      [13.792, 49.31],
    ],
  },
  {
    stars: [
      [2.53, 89.26],
      [17.537, 86.59],
      [16.767, 82.04],
      [15.734, 77.79],
      [14.845, 74.16],
      [15.345, 71.83],
      [16.292, 75.76],
    ],
  },
  {
    stars: [
      [2.12, 23.46],
      [1.911, 20.81],
      [1.911, 19.29],
    ],
  },
  {
    stars: [
      [4.599, 16.51],
      [4.477, 19.18],
      [4.329, 15.63],
      [3.791, 24.11],
      [3.819, 24.05],
      [3.743, 24.11],
    ],
  },
  {
    stars: [
      [7.576, 31.89],
      [7.755, 28.03],
      [6.732, 25.13],
      [6.383, 22.51],
      [7.335, 21.98],
      [6.628, 16.4],
    ],
  },
  {
    stars: [
      [8.275, 9.19],
      [8.975, 11.86],
      [8.745, 18.15],
      [8.725, 21.47],
    ],
  },
  {
    stars: [
      [9.879, 26.01],
      [10.278, 23.42],
      [10.333, 19.84],
      [10.123, 16.76],
      [10.139, 11.97],
      [11.238, 15.43],
      [11.818, 14.57],
      [11.235, 20.52],
    ],
  },
  {
    stars: [
      [12.332, -0.67],
      [12.694, -1.45],
      [12.928, 3.4],
      [13.037, 10.96],
      [13.42, -11.16],
      [13.578, -0.6],
    ],
  },
  {
    stars: [
      [14.848, -16.04],
      [15.283, -9.38],
      [15.07, -25.28],
    ],
  },
  {
    stars: [
      [16.09, -19.81],
      [16.006, -22.62],
      [15.983, -26.11],
      [16.49, -26.43],
      [16.6, -28.22],
      [16.836, -34.29],
      [17.202, -43.24],
      [17.622, -42.99],
      [17.56, -37.1],
      [17.528, -37.3],
    ],
  },
  {
    stars: [
      [18.096, -30.42],
      [18.35, -29.83],
      [18.403, -34.38],
      [19.043, -29.88],
      [18.921, -26.3],
      [18.46, -25.42],
      [18.761, -26.99],
    ],
  },
  {
    stars: [
      [20.294, -12.54],
      [20.35, -14.78],
      [20.858, -26.92],
      [21.67, -16.66],
      [21.784, -16.13],
    ],
  },
  {
    stars: [
      [20.794, -9.5],
      [21.526, -5.57],
      [22.096, -0.32],
      [22.273, -7.78],
      [22.877, -15.82],
    ],
  },
  {
    stars: [
      [23.466, 6.36],
      [23.666, 5.63],
      [23.704, 1.77],
      [23.992, 6.86],
      [23.286, 3.28],
      [2.034, 2.76],
    ],
  },
]

const PLANETS: { color: string; radius: number; L0: number; rate: number; ring?: boolean }[] = [
  { color: '#c9b8a2', radius: 64, L0: 252.25, rate: 4.09233445 },
  { color: '#ffe3a1', radius: 127, L0: 181.98, rate: 1.60213034 },
  { color: '#e15b3a', radius: 91, L0: 355.43, rate: 0.5240208 },
  { color: '#e4c48a', radius: 204, L0: 34.35, rate: 0.0830853 },
  { color: '#f0ddb0', radius: 163, L0: 50.08, rate: 0.0334442, ring: true },
]

function flatStars() {
  return FIGURES.flatMap((figure) => figure.stars)
}

/** Osas, zodiac, and the five naked-eye planets. No filler star field. */
export class NightSky {
  readonly root = new THREE.Group()
  private readonly stars: THREE.Points
  private readonly bodies: { mesh: THREE.Object3D; L0: number; rate: number }[]
  private readonly materials: THREE.Material[]
  private readonly bandOpacity = { value: 1 }
  private readonly galacticPole = { value: new THREE.Vector3(0, 1, 0) }
  private readonly galacticCenter = { value: new THREE.Vector3(1, 0, 0) }
  constructor() {
    const stars = flatStars()
    const positions = new Float32Array(stars.length * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const colors = new Float32Array(stars.length * 3)
    const sizes = new Float32Array(stars.length)
    stars.forEach(([, dec], i) => {
      const polaris = dec > 89
      colors.set(polaris ? [1.45, 1.5, 1.7] : [0.95686275, 0.96862745, 1], i * 3)
      sizes[i] = polaris ? 3.6 : 2.8
    })
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1))
    const material = new THREE.PointsMaterial({
      size: 2.8,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
    })
    material.customProgramCacheKey = () => 'night-star-size'
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float starSize;')
        .replace('gl_PointSize = size;', 'gl_PointSize = starSize;')
    }
    this.stars = new THREE.Points(geometry, material)
    this.stars.renderOrder = 2
    this.root.add(this.stars)
    const band = new THREE.Mesh(
      new THREE.SphereGeometry(70000, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          opacity: this.bandOpacity,
          galacticPole: this.galacticPole,
          galacticCenter: this.galacticCenter,
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: false,
        side: THREE.BackSide,
        vertexShader: `
          varying vec3 vDir;
          varying float vFragDepth;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vDir = world.xyz - cameraPosition;
            gl_Position = projectionMatrix * viewMatrix * world;
            vFragDepth = 1.0 + gl_Position.w;
          }
        `,
        fragmentShader: `
          uniform float opacity;
          uniform vec3 galacticPole;
          uniform vec3 galacticCenter;
          varying vec3 vDir;
          varying float vFragDepth;
          #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
            uniform float logDepthBufFC;
          #endif
          void main() {
            vec3 d = normalize(vDir);
            vec3 pole = normalize(galacticPole);
            vec3 coreDir = normalize(galacticCenter);
            float lat = abs(dot(d, pole));
            float core = pow(max(dot(d, coreDir), 0.0), 8.0);
            float band = exp(-lat * lat * mix(78.0, 26.0, core));
            float alpha = band * (0.028 + core * 0.04) * opacity;
            if (alpha < 0.008) discard;
            #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
              gl_FragDepth = log2(max(vFragDepth, 1.0)) * logDepthBufFC * 0.5;
            #endif
            vec3 color = mix(vec3(0.28, 0.3, 0.36), vec3(0.42, 0.38, 0.32), core);
            gl_FragColor = vec4(color, alpha);
          }
        `,
      }),
    )
    band.name = 'Milky Way'
    band.frustumCulled = false
    band.renderOrder = -1
    this.root.add(band)
    this.bodies = PLANETS.map((planet) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(planet.radius, 24, 16),
        new THREE.MeshBasicMaterial({ color: planet.color, transparent: true, fog: false }),
      )
      if (planet.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(planet.radius * 1.45, planet.radius * 2.35, 48),
          new THREE.MeshBasicMaterial({
            color: '#e7d7a8',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            fog: false,
          }),
        )
        ring.rotation.x = Math.PI / 2.4
        mesh.add(ring)
      }
      mesh.renderOrder = 2
      this.root.add(mesh)
      return { mesh, L0: planet.L0, rate: planet.rate }
    })
    this.materials = []
    this.root.traverse((node) => {
      const material = (node as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (!material) return
      for (const item of Array.isArray(material) ? material : [material]) this.materials.push(item)
    })
  }
  place(at: Date, rotation: THREE.Quaternion) {
    const stars = flatStars()
    const position = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute
    stars.forEach(([ra, dec], i) => {
      const dir = equatorialDirection(at, ra, dec).applyQuaternion(rotation)
      position.setXYZ(i, dir.x * STAR_RADIUS, dir.y * STAR_RADIUS, dir.z * STAR_RADIUS)
    })
    position.needsUpdate = true
    this.galacticPole.value.copy(equatorialDirection(at, 12.857, 27.13).applyQuaternion(rotation))
    this.galacticCenter.value.copy(equatorialDirection(at, 17.76, -28.94).applyQuaternion(rotation))
    const n = at.getTime() / 86400000 + 2440587.5 - 2451545
    for (const body of this.bodies) {
      const dir = eclipticDirection(at, body.L0 + body.rate * n).applyQuaternion(rotation)
      body.mesh.position.copy(dir).multiplyScalar(PLANET_DISTANCE)
    }
  }
  set opacity(value: number) {
    for (const material of this.materials) material.opacity = value
    this.bandOpacity.value = value
  }
}
