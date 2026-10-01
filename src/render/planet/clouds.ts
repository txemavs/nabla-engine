import * as THREE from 'three'

/** A few soft puffs. Analytic, lit by the same sun. Not a volume march. */
const seeds: [number, number, number, number][] = [
  [0.15, 0.72, -0.55, 14],
  [-0.7, 0.5, -0.2, 11],
  [0.62, 0.38, 0.48, 10],
  [-0.2, 0.9, 0.22, 16],
]

function puffs(): THREE.Vector4[] {
  return seeds.map(([x, y, z, softness]) => {
    const length = Math.hypot(x, y, z)
    return new THREE.Vector4(x / length, y / length, z / length, softness)
  })
}

export function createCloudLayer(sunDirection: THREE.Vector3) {
  const coverage = { value: 1 }
  const material = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDirection },
      coverage,
      dayHours: { value: 0 },
      puffs: { value: puffs() },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 skyRay;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        skyRay = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform float coverage;
      uniform float dayHours;
      uniform vec4 puffs[4];
      varying vec3 skyRay;
      void main() {
        vec3 ray = normalize(skyRay);
        vec3 sun = normalize(sunDirection);
        float puff = 0.0;
        float shade = 0.0;
        for (int i = 0; i < 4; i++) {
          float turn = dayHours * (0.22 + float(i) * 0.05);
          float cs = cos(turn);
          float sn = sin(turn);
          vec3 dir = puffs[i].xyz;
          vec3 moved = normalize(vec3(dir.x * cs - dir.z * sn, dir.y, dir.x * sn + dir.z * cs));
          float falloff = exp(-max(0.0, 1.0 - dot(ray, moved)) * puffs[i].w);
          puff += falloff;
          shade += falloff * dot(moved, sun);
        }
        float alpha = 1.0 - exp(-puff * 1.15);
        alpha *= smoothstep(0.02, 0.28, ray.y);
        alpha *= coverage;
        alpha *= 1.0 - smoothstep(0.993, 0.9994, dot(ray, sun));
        if (alpha < 0.004) discard;
        float scatter = pow(max(dot(ray, sun), 0.0), 6.0);
        float lit = clamp(0.28 + shade * 0.55 + scatter * 0.3, 0.0, 1.0);
        vec3 color = mix(vec3(0.72, 0.76, 0.82), vec3(1.0, 0.99, 0.97), lit);
        gl_FragColor = vec4(color, alpha * 0.72);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(170000, 24, 16), material)
  mesh.name = 'Clouds'
  mesh.frustumCulled = false
  mesh.renderOrder = -90
  return { mesh, coverage, dayHours: material.uniforms.dayHours }
}

/** Hours since local midnight, including the fraction the clock is sitting on. */
export function cloudHours(at: Date): number {
  return (
    at.getHours() + at.getMinutes() / 60 + at.getSeconds() / 3600 + at.getMilliseconds() / 3_600_000
  )
}
