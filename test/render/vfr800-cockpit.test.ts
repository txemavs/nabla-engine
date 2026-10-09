/**
 * VFR800 cockpit pass: the GLB edits from scripts/prepare-vfr800-cockpit.mjs (mirror nodes,
 * instrument anchors, metal map, blended windscreen), the reflection environment and the live
 * instrument cluster (needle angles and lamp logic).
 */
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { twoWheeledDefaults } from '../../src/config/simulation.js'
import {
  MotorcycleInstruments,
  dialValues,
  lcdText,
  motorcycleClusterDefaults,
  needleAngle,
  warningLampStates,
  type ClusterInputs,
} from '../../src/render/vehicle-presentation/motorcycle-instruments.js'
import {
  applyReflectionEnvironment,
  reflectionEnvironmentTexture,
} from '../../src/render/vehicle-presentation/reflection-environment.js'
import { CarMirrors } from '../../src/render/entity/car-mirrors.js'
import { motorcycleMirrorLenses } from '../../src/render/vehicle-presentation/motorcycle-mirrors.js'

const bytes = readFileSync('assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb')
const load = async () =>
  (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      '',
    )
  ).scene
const materialsOf = (object: THREE.Object3D) => {
  const out = new Set<THREE.MeshStandardMaterial>()
  object.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh)
      for (const m of [mesh.material].flat()) out.add(m as THREE.MeshStandardMaterial)
  })
  return [...out]
}

describe('vfr800 GLB cockpit pass', () => {
  it('has fairing-mounted mirror_L and mirror_R nodes with reflective glass', async () => {
    const root = await load()
    const body = root.getObjectByName('Body')!
    for (const [name, side] of [
      ['mirror_L', -1],
      ['mirror_R', 1],
    ] as const) {
      const mirror = root.getObjectByName(name)!
      expect(mirror, name).toBeTruthy()
      // Mounted on the fairing (Body), not on the steering.
      expect(mirror.parent).toBe(body)
      const box = new THREE.Box3().setFromObject(mirror)
      const size = box.getSize(new THREE.Vector3())
      expect(Math.sign(box.getCenter(new THREE.Vector3()).x)).toBe(side)
      // Plausible size: a housing and stalk some 15-35 cm wide, 5-20 cm tall.
      expect(size.x).toBeGreaterThan(0.15)
      expect(size.x).toBeLessThan(0.35)
      expect(size.y).toBeGreaterThan(0.05)
      expect(size.y).toBeLessThan(0.2)
      expect(materialsOf(mirror).some((m) => m.metalness >= 0.9 && m.roughness < 0.15)).toBe(true)
    }
  })

  it('keeps chrome only on the brake discs and the silencer end cap; the rest is satin metal', async () => {
    const root = await load()
    /** Materials drawn by a node's own mesh (not its child nodes). */
    const ownMeshes = (name: string) => {
      const node = root.getObjectByName(name)!
      return [node, ...node.children].filter((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh[]
    }
    const own = (name: string) =>
      new Set(ownMeshes(name).flatMap((m) => [m.material].flat().map((x) => x.name)))
    const CHROME = 'Stainless chrome silencer end cap'
    const SATIN = 'Satin aluminium chassis, fork and passenger footrests'
    const STANCHIONS = 'Polished aluminium fork stanchions'
    const DISCS = 'Polished chrome brake tracks'
    const BUTTONS = 'Chrome exhaust and discs'
    const material = (name: string) => materialsOf(root).find((m) => m.name === name)!

    // Every chrome-looking surface (bright, fully metallic, glossy), by node: only the discs and
    // their floating buttons, the silencer end cap, the headlamp reflector and the mirror glass.
    const chromeLike = (m: THREE.MeshStandardMaterial) =>
      m.metalness >= 0.9 && m.roughness < 0.25 && (m.color.r + m.color.g + m.color.b) / 3 > 0.45
    const nodes = new Set<string>()
    root.traverse((o) => {
      // GLB nodes only (three.js names a multi-primitive node's meshes `<node>_<n>`).
      const primitive =
        !!o.parent?.name && o.name.startsWith(`${o.parent.name}_`) && /_\d+$/.test(o.name)
      if (o.name && !primitive && ownMeshes(o.name).length) nodes.add(o.name)
    })
    const chrome = [...nodes]
      .flatMap((node) =>
        ownMeshes(node).flatMap((mesh) =>
          [mesh.material]
            .flat()
            .filter((m) => chromeLike(m as THREE.MeshStandardMaterial))
            .map((m) => `${node}: ${m.name}`),
        ),
      )
      .filter((v, i, all) => all.indexOf(v) === i)
      .sort()
    expect(chrome).toEqual(
      [
        `Body: ${CHROME}`,
        'Body: Reflector',
        `Wheel_Front: ${BUTTONS}`,
        `Wheel_Front: ${DISCS}`,
        `Wheel_Rear: ${DISCS}`,
        'mirror_L: Reflector',
        'mirror_R: Reflector',
      ].sort(),
    )
    // Body's reflector is the headlamp's, right behind the clear lens.
    const centreOf = (name: string) =>
      new THREE.Box3()
        .setFromObject(ownMeshes('Body').find((m) => [m.material].flat()[0].name === name)!)
        .getCenter(new THREE.Vector3())
    expect(centreOf('Reflector').distanceTo(centreOf('Headlamp clear lens'))).toBeLessThan(0.3)
    // The end cap: the short part at the very end of the silencer, on the right.
    const cap = ownMeshes('Body').find((m) => [m.material].flat()[0].name === CHROME)!
    // In Body's own frame (the script's coordinates; the model faces −Z, rider's right is +X).
    // The primitive shares the exhaust's vertex buffer: measure the indexed vertices only.
    const capBox = new THREE.Box3()
    const position = cap.geometry.getAttribute('position')
    const index = cap.geometry.getIndex()!
    for (let i = 0; i < index.count; i++)
      capBox.expandByPoint(new THREE.Vector3().fromBufferAttribute(position, index.getX(i)))
    expect(capBox.min.z).toBeGreaterThan(0.9)
    expect(capBox.max.z - capBox.min.z).toBeLessThan(0.1)
    expect(capBox.min.x).toBeGreaterThan(0)
    const end = material(CHROME)
    expect(end.metalness).toBe(1)
    expect(end.roughness).toBeCloseTo(0.15, 6)
    expect(end.color.r).toBeGreaterThan(0.8)
    expect(end.color.b - end.color.r).toBeCloseTo(0, 6)
    // The headers, the silencer can and the engine: the triple clamp's satin grey. No authored
    // chrome is left on the body (the old chrome covered the headers, can and end cap).
    expect(own('Body')).toContain(SATIN)
    expect(own('Body')).not.toContain(BUTTONS)
    expect(own('Steering_Pivot')).toContain(SATIN)
    const satin = material(SATIN)
    expect(satin.metalness).toBe(1)
    expect(satin.roughness).toBeGreaterThanOrEqual(0.35)
    // Stanchions: polished aluminium grey, not chrome; the fork lowers satin grey.
    expect(own('Fork_Slider')).toContain(STANCHIONS)
    expect(own('Fork_Slider')).toContain(SATIN)
    expect(own('Fork_Slider')).not.toContain(BUTTONS)
    const stanchions = material(STANCHIONS)
    // Lighter than the satin (0.36) but far from the chrome (0.95) and not glossy.
    expect(stanchions.roughness).toBeGreaterThanOrEqual(0.3)
    expect(stanchions.color.r).toBeLessThan(0.6)
    expect(stanchions.color.b - stanchions.color.r).toBeCloseTo(0, 6)
    // The radiator core keeps its graphite; chain and swingarm as authored.
    expect(own('Body')).toContain('Graphite engine cases')
    expect(own('Chain')).toEqual(new Set(['Black smooth chain band']))
    expect(own('Swingarm_Pivot')).toEqual(
      new Set(['Black upper chain guard', 'Cast grey rear swingarm']),
    )
    const buttons = material(BUTTONS)
    expect(buttons.roughness).toBeCloseTo(0.15, 6)
    // The reflection environment is colourless (a blue sky tinted the chrome).
    const pixels = reflectionEnvironmentTexture().image.data as Uint8Array
    for (let i = 0; i < pixels.length; i += 4) {
      expect(pixels[i + 1]).toBe(pixels[i])
      expect(pixels[i + 2]).toBe(pixels[i])
    }
    const env = applyReflectionEnvironment(root)
    expect(env.materials).toContain(end)
    // No private boost: the end cap and the disc buttons reflect like the other metal, and the
    // reflection is shaded by the surface's own light (so it goes dark in shade and at night).
    expect(end.envMapIntensity).toBeCloseTo(1, 6)
    expect(buttons.envMapIntensity).toBeCloseTo(1, 6)
    expect(buttons.roughness).toBeCloseTo(0.15, 6)
    expect(end.emissive.r + end.emissive.g + end.emissive.b).toBe(0)
    const shader = {
      fragmentShader:
        'vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;',
    }
    end.onBeforeCompile(shader as never, {} as never)
    expect(shader.fragmentShader).toContain('nablaIncident')
    expect(shader.fragmentShader).toContain(
      'indirectSpecular *= max( saturate( nablaIncident ), vec3( 0.50 ) )',
    )
    expect(end.customProgramCacheKey()).toContain('nabla-shaded-env')
    // Matte paint and rubber are left alone.
    const rubber = materialsOf(root).find((m) => m.name === 'Smooth rubber')!
    expect(rubber.envMap).toBeNull()
  })

  it('blends a see-through smoke-grey windscreen with a slight reflection', async () => {
    const root = await load()
    const screen = materialsOf(root).find((m) => m.name.startsWith('Smoked translucent'))!
    // «Gris humo»: a neutral grey tint, neither blue nor brown.
    expect(screen.color.g - screen.color.r).toBeCloseTo(0, 6)
    expect(screen.color.b - screen.color.r).toBeCloseTo(0, 6)
    expect(screen.transparent).toBe(true)
    expect(screen.opacity).toBeGreaterThan(0.15)
    expect(screen.opacity).toBeLessThan(0.4)
    expect(screen.depthWrite).toBe(false)
    expect((screen as THREE.MeshPhysicalMaterial).transmission ?? 0).toBe(0)
    const env = applyReflectionEnvironment(root)
    expect(screen.envMap).toBeTruthy()
    // Slight reflection: a dimmed environment on the screen, full strength on the chrome.
    expect(screen.envMapIntensity).toBeCloseTo(0.35, 6)
    env.setLevel(0.5)
    expect(screen.envMapIntensity).toBeCloseTo(0.175, 6)
  })

  it('carries the instrument anchors and binds a live cluster to them', async () => {
    const root = await load()
    for (const name of [
      'gauge_speedo',
      'gauge_tacho',
      'gauge_lcd',
      'lamp_signal_l',
      'lamp_signal_r',
      'lamp_warning_1',
      'lamp_warning_4',
    ])
      expect(root.getObjectByName(name), name).toBeTruthy()
    const cluster = MotorcycleInstruments.bind(root)!
    expect(cluster).toBeTruthy()
    cluster.update({ ...inputs, speedKmh: 140, rpm: 6500, signalLeft: true })
    const o = motorcycleClusterDefaults
    expect(cluster.needleAngles().speedo).toBeCloseTo(needleAngle(140, o.speedoMaxKmh, o.sweep), 9)
    expect(cluster.needleAngles().tacho).toBeCloseTo(needleAngle(6500, o.tachoMaxRpm, o.sweep), 9)
    expect(cluster.lampStates().signals).toEqual([true, false])
    cluster.dispose()
  })
})

const inputs: ClusterInputs = {
  powered: true,
  ignition: 'running',
  gaugeSweep: 0,
  speedKmh: 0,
  rpm: 1200,
  gear: 3,
  parked: false,
  highBeam: false,
  signalLeft: false,
  signalRight: false,
  clockMinutes: 9 * 60 + 5,
  odometerKm: 12.34,
  tripKm: 12.34,
}

describe('motorcycle instrument logic', () => {
  const sweep = (240 * Math.PI) / 180

  it('maps needle angles across a centred sweep, clamped to the dial', () => {
    expect(needleAngle(0, 280, sweep)).toBeCloseTo(-sweep / 2, 12)
    expect(needleAngle(140, 280, sweep)).toBeCloseTo(0, 12)
    expect(needleAngle(280, 280, sweep)).toBeCloseTo(sweep / 2, 12)
    expect(needleAngle(400, 280, sweep)).toBeCloseTo(sweep / 2, 12)
    expect(needleAngle(-5, 280, sweep)).toBeCloseTo(-sweep / 2, 12)
    expect(needleAngle(Number.NaN, 280, sweep)).toBeCloseTo(-sweep / 2, 12)
  })

  it('sweeps both needles during the start-up self-test and rests them when off', () => {
    const o = motorcycleClusterDefaults
    expect(dialValues({ ...inputs, ignition: 'sweep', gaugeSweep: 0.5 }, o)).toEqual({
      speedKmh: o.speedoMaxKmh / 2,
      rpm: o.tachoMaxRpm / 2,
    })
    expect(dialValues({ ...inputs, powered: false, speedKmh: 90, rpm: 5000 }, o)).toEqual({
      speedKmh: 0,
      rpm: 0,
    })
  })

  it('lights neutral, high beam, oil and FI from the bike state', () => {
    const lamps = ['neutral', 'high-beam', 'oil', 'fi'] as const
    expect(warningLampStates(lamps, inputs)).toEqual([false, false, false, false])
    expect(warningLampStates(lamps, { ...inputs, gear: 0 })).toEqual([true, false, false, false])
    expect(warningLampStates(lamps, { ...inputs, parked: true })[0]).toBe(true)
    expect(warningLampStates(lamps, { ...inputs, highBeam: true })[1]).toBe(true)
    // Cranking: oil pressure and FI on. Needle sweep (engine caught): FI self-check only.
    expect(warningLampStates(lamps, { ...inputs, ignition: 'cranking' })).toEqual([
      false,
      false,
      true,
      true,
    ])
    expect(warningLampStates(lamps, { ...inputs, ignition: 'sweep' })).toEqual([
      false,
      false,
      false,
      true,
    ])
    expect(warningLampStates(lamps, { ...inputs, powered: false, gear: 0 })).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it('shows clock, gear and distances on the LCD', () => {
    expect(lcdText(inputs)).toEqual({
      clock: '09:05',
      gear: '3',
      odometer: 'ODO 000012',
      trip: 'TRIP  12.3',
    })
    expect(lcdText({ ...inputs, gear: 0 })!.gear).toBe('N')
    expect(lcdText({ ...inputs, powered: false })).toBeNull()
  })

  it('the tucked eye keeps the horizon clear above the fairing and the tacho low in view', async () => {
    const root = await load()
    root.updateMatrixWorld(true)
    const seated = new THREE.Vector3()
    root.getObjectByName('drivereyes')!.getWorldPosition(seated)
    // Auto tuck and a full manual tuck above 180 km/h both reach this eye.
    const eye = seated.clone().add(new THREE.Vector3(...twoWheeledDefaults.rider.tuck.eye))
    expect(seated.y - eye.y).toBeGreaterThan(0.15) // still a tuck: down…
    expect(seated.z - eye.z).toBeGreaterThan(0.2) // …and forward
    const deg = (v: THREE.Vector3) => (Math.atan2(v.y - eye.y, eye.z - v.z) * 180) / Math.PI
    // Highest opaque point ahead within the screen's width (mirrors and the screen excluded).
    let opaque = -90
    const v = new THREE.Vector3()
    root.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || /mirror/i.test(mesh.name)) return
      const name = [mesh.material].flat()[0].name
      if (name.startsWith('Smoked') || name.startsWith('Reflector')) return
      const position = mesh.geometry.attributes.position
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        if (v.z < eye.z - 0.05 && Math.abs(v.x) < 0.25) opaque = Math.max(opaque, deg(v))
      }
    })
    expect(opaque).toBeLessThan(-3) // the horizon (0°) is clear
    const tacho = new THREE.Vector3()
    root.getObjectByName('gauge_tacho')!.getWorldPosition(tacho)
    // In the lower part of a 70° first-person view.
    expect(deg(tacho)).toBeLessThan(-8)
    expect(deg(tacho)).toBeGreaterThan(-32)
  })
})

describe('reflection environment orientation', () => {
  it('puts the sky overhead and the ground below (three equirect lookup, unflipped rows)', () => {
    const texture = reflectionEnvironmentTexture()
    const { data, width, height } = texture.image as {
      data: Uint8Array
      width: number
      height: number
    }
    expect(texture.flipY).toBe(false)
    expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping)
    // three's equirectUv: v = asin(dir.y) / π + 0.5, and row r of an unflipped DataTexture is
    // v = (r + 0.5) / height. A world direction's row:
    const rowOf = (dirY: number) =>
      Math.min(height - 1, Math.floor((Math.asin(dirY) / Math.PI + 0.5) * height))
    const grey = (row: number) => {
      const i = (row * width + width / 2) * 4
      expect(data[i]).toBe(data[i + 1])
      expect(data[i + 1]).toBe(data[i + 2])
      return data[i]
    }
    const up = grey(rowOf(1)),
      skyHigh = grey(rowOf(Math.sin(THREE.MathUtils.degToRad(30)))),
      horizonAbove = grey(rowOf(0.02)),
      groundNear = grey(rowOf(-0.02)),
      down = grey(rowOf(-1))
    // Light overhead, brightest just above the horizon, dark ground, darkest straight down.
    expect(up).toBeGreaterThan(150)
    expect(horizonAbove).toBeGreaterThan(skyHigh)
    expect(skyHigh).toBeGreaterThan(down + 80)
    expect(groundNear).toBeLessThan(horizonAbove - 100)
    expect(down).toBeLessThan(60)
  })
})

describe('vfr800 rear-view mirrors', () => {
  /** Where the eye sees through each live glass (`Reflector`), as a reflected unit direction. */
  const views = (root: THREE.Object3D, lenses: THREE.Mesh[], eye: THREE.Vector3) => {
    root.updateMatrixWorld(true)
    return Object.fromEntries(
      lenses.map((lens) => {
        const glass = lens.parent!.children.find(
          (node) => (node as { isReflector?: boolean }).isReflector,
        )!
        const centre = glass.getWorldPosition(new THREE.Vector3())
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(glass.matrixWorld)
        const d = centre.sub(eye).normalize()
        return [lens.userData.nabla.mirror as string, d.addScaledVector(normal, -2 * d.dot(normal))]
      }),
    )
  }
  const degrees = (a: THREE.Vector3, b: THREE.Vector3) => (a.angleTo(b) * 180) / Math.PI

  it('turns the mirror_L / mirror_R glass into live mirrors the «Espejos» sliders adjust', async () => {
    const root = await load()
    const lenses = motorcycleMirrorLenses(root)
    expect(lenses.map((l) => [l.parent!.name, l.userData.nabla.mirror])).toEqual([
      ['mirror_L', 'left'],
      ['mirror_R', 'right'],
    ])
    for (const lens of lenses)
      expect((lens.material as THREE.MeshStandardMaterial).name).toBe('Reflector')
    let eye: THREE.Vector3 | undefined
    root.updateMatrixWorld(true)
    root.traverse((node) => {
      if (node.userData.nabla?.anchor === 'driver.eyes')
        eye = node.getWorldPosition(new THREE.Vector3())
    })
    expect(eye).toBeTruthy()
    const mirrors = new CarMirrors(lenses, new THREE.Vector3(0, 1, 0), 0, {}, root)
    expect(mirrors.sides).toEqual(['left', 'right'])
    const authored = views(root, lenses, eye!)
    // The glass as modelled shows the road behind (the bike faces −Z), each on its own side.
    for (const side of ['left', 'right']) expect(authored[side].z).toBeGreaterThan(0.5)
    expect(authored.left.x).toBeLessThan(authored.right.x)

    mirrors.setAdjustment({ left: { yaw: 5 }, right: { yaw: 5 } })
    const outward = views(root, lenses, eye!)
    expect(outward.left.x).toBeLessThan(authored.left.x - 0.1)
    expect(outward.right.x).toBeGreaterThan(authored.right.x + 0.1)
    expect(degrees(outward.left, authored.left)).toBeGreaterThan(8)
    expect(degrees(outward.left, authored.left)).toBeLessThan(12)

    mirrors.setAdjustment({ right: { tilt: 4 } })
    const raised = views(root, lenses, eye!)
    expect(raised.right.y).toBeGreaterThan(authored.right.y + 0.05)
    expect(degrees(raised.left, authored.left)).toBeLessThan(1e-3)

    // Both capture cameras run upright (vehicle up), so nothing in either mirror is upside down.
    const scene = new THREE.Scene()
    scene.add(root)
    const camera = new THREE.PerspectiveCamera(70, 1.5, 0.05, 1000)
    camera.position.copy(eye!)
    camera.updateMatrixWorld(true)
    const ups: Record<string, number> = {}
    for (const e of (
      mirrors as unknown as {
        entries: { side: string; capture: THREE.Camera; render: () => void }[]
      }
    ).entries)
      e.render = () =>
        (ups[e.side] = new THREE.Vector3(0, 1, 0).transformDirection(e.capture.matrixWorld).y)
    mirrors.render(
      { domElement: { dataset: {} } } as unknown as THREE.WebGLRenderer,
      scene,
      camera,
      true,
      0,
    )
    expect(Object.keys(ups).sort()).toEqual(['left', 'right'])
    for (const side of ['left', 'right']) expect(ups[side]).toBeGreaterThan(0.95)
    mirrors.dispose()
  })
})
