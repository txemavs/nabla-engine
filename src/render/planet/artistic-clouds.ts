import {
  BufferGeometry,
  Float32BufferAttribute,
  FrontSide,
  Mesh,
  MeshLambertMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p * 2.02;
    a *= 0.5;
  }
  return v;
}
float cumulus(vec2 xz, float hours, float thresh) {
  vec2 p = (xz + vec2(hours * 28800.0, hours * 9000.0)) * 0.000026;
  float bank = noise(p);
  float lump = noise(mat2(0.8, 0.6, -0.6, 0.8) * p * 2.15 + vec2(5.2, 1.3));
  float n = bank * 0.82 + lump * 0.18;
  float edge = smoothstep(thresh, thresh + 0.13, n);
  float grain = noise(p * 4.2 + vec2(9.0, 4.0));
  return edge * mix(0.8, 1.0, grain);
}
float alto(vec2 xz, float hours, float thresh) {
  vec2 p = xz + vec2(hours * 62000.0, hours * -20000.0);
  p = mat2(0.9, 0.44, -0.44, 0.9) * p * vec2(0.000048, 0.000015);
  float sheet = noise(p) * 0.78 + noise(p * 2.05 + vec2(2.0, 7.0)) * 0.22;
  return smoothstep(thresh - 0.1, thresh + 0.22, sheet);
}
float cirrus(vec2 xz, float hours, float thresh) {
  vec2 p = xz + vec2(hours * 140000.0, hours * 32000.0);
  p = mat2(0.62, 0.78, -0.78, 0.62) * p * vec2(0.00012, 0.00001);
  float streak = noise(p) * 0.72 + noise(p * vec2(2.6, 1.05) + vec2(8.0, 3.0)) * 0.28;
  return smoothstep(thresh + 0.05, thresh + 0.46, streak);
}
float sampleCloud(vec2 xz, float hours, float thresh, float kind) {
  if (kind < 0.5) return cumulus(xz, hours, thresh);
  if (kind < 1.5) return alto(xz, hours, thresh);
  return cirrus(xz, hours, thresh);
}
`

const skyVertex = `
  varying vec3 rayDir;
  void main() {
    vec4 view = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
    rayDir = mat3(inverse(viewMatrix)) * (view.xyz / view.w);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const skyFragment = `
  uniform vec3 sunDirection;
  uniform float coverage;
  uniform float dayHours;
  uniform float golden;
  uniform float day;
  uniform float amount;
  uniform float storm;
  uniform float cumBase;
  uniform float cumThick;
  uniform float altoBase;
  uniform float altoThick;
  uniform float cirBase;
  uniform float cirThick;
  uniform vec3 cloudOrigin;
  uniform mat4 projectionMatrix;
  varying vec3 rayDir;
  #if defined( USE_LOGDEPTHBUF ) || defined( USE_LOGARITHMIC_DEPTH_BUFFER )
    uniform float logDepthBufFC;
  #endif
  ${NOISE}
  vec2 march(vec3 ro, vec3 rd, float y0, float y1, float kind, float thresh) {
    float dy = rd.y;
    float t0;
    float t1;
    if (abs(dy) < 0.0008) {
      if (ro.y < y0 || ro.y > y1) return vec2(0.0, -1.0);
      t0 = 0.0;
      t1 = 180000.0;
    } else {
      t0 = (y0 - ro.y) / dy;
      t1 = (y1 - ro.y) / dy;
      if (t0 > t1) { float s = t0; t0 = t1; t1 = s; }
      t0 = max(t0, 0.0);
      if (t1 <= t0 || t0 > 500000.0) return vec2(0.0, -1.0);
      t1 = t0 + min(t1 - t0, 180000.0);
    }
    float span = max(t1 - t0, 1.0);
    float r = span > 12000.0 ? 1.9 : 1.001;
    float inv = span / (pow(r, 6.0) - 1.0);
    float alpha = 0.0;
    float tHit = -1.0;
    float thick = max(y1 - y0, 30.0);
    for (int i = 0; i < 6; i++) {
      float ri = pow(r, float(i));
      float t = t0 + (ri - 1.0 + ri * (r - 1.0) * 0.5) * inv;
      vec3 p = ro + rd * t;
      float profile = kind < 0.5
        ? smoothstep(y0, y0 + thick * 0.07, p.y) * (1.0 - smoothstep(y1 - thick * 0.55, y1, p.y))
        : kind < 1.5
          ? smoothstep(y0, y0 + thick * 0.15, p.y) * (1.0 - smoothstep(y1 - thick * 0.15, y1, p.y))
          : smoothstep(y0, y0 + thick * 0.35, p.y) * (1.0 - smoothstep(y1 - thick * 0.2, y1, p.y));
      float d = sampleCloud(p.xz, dayHours, thresh, kind) * profile;
      if (tHit < 0.0 && d > 0.15) tHit = t;
      alpha += d * 0.34 * (1.0 - alpha);
    }
    if (tHit < 0.0 && alpha > 0.02) tHit = max(t0, 40.0);
    return vec2(alpha, tHit);
  }
  void main() {
    vec3 rd = normalize(rayDir);
    vec3 ro = cameraPosition + cloudOrigin;
    vec3 sun = normalize(sunDirection);
    float mu = max(dot(rd, sun), 0.0);
    float thresh = clamp(mix(0.94, 0.15, amount) - storm * 0.08, 0.05, 0.97);
    vec3 shade = mix(mix(vec3(0.55, 0.6, 0.68), vec3(0.62, 0.34, 0.4), golden), vec3(0.1, 0.11, 0.13), storm);
    vec3 lit = mix(mix(vec3(0.98, 0.98, 0.99), vec3(1.05, 0.62, 0.22), golden), vec3(0.28, 0.3, 0.34), storm);
    float gain = mix(0.12, 1.35, amount) * mix(0.9, 1.15, storm);
    float lightTerm = clamp(0.25 + pow(mu, 2.0) * (1.0 - storm * 0.85), 0.0, 1.0);
    vec2 cum = march(ro, rd, cumBase, cumBase + cumThick, 0.0, thresh);
    vec2 alto = march(ro, rd, altoBase, altoBase + altoThick, 1.0, thresh);
    vec2 cir = march(ro, rd, cirBase, cirBase + cirThick, 2.0, thresh);
    float inDeck = step(cumBase, ro.y) * step(ro.y, cumBase + cumThick);
    float cap = mix(mix(0.4, 0.72, amount), 0.88, inDeck);
    float a0 = clamp(cum.x * gain, 0.0, cap);
    float a1 = clamp(alto.x * gain * 0.55, 0.0, 0.4) * (1.0 - a0);
    float a2 = clamp(cir.x * gain * 0.4, 0.0, 0.28) * (1.0 - a0 - a1);
    vec3 c0 = mix(shade, lit, lightTerm);
    vec3 c1 = mix(vec3(0.58, 0.6, 0.64), vec3(0.86, 0.88, 0.9), lightTerm);
    vec3 c2 = mix(vec3(0.78, 0.8, 0.84), vec3(1.0, 1.0, 1.02), lightTerm * 0.45 + 0.55);
    vec3 color = (c0 * a0 + c1 * a1 + c2 * a2) / max(a0 + a1 + a2, 0.001);
    float alpha = (a0 + a1 + a2) * coverage;
    float under = step(ro.y, cumBase);
    alpha *= mix(1.0, smoothstep(-0.02, 0.08, rd.y), under);
    float night = 1.0 - smoothstep(0.0, 0.4, day);
    color = mix(color, color * 0.05, night);
    alpha *= mix(1.0, 0.22, night);
    if (ro.y < cumBase - 40.0) alpha *= 1.0 - smoothstep(0.997, 0.9995, mu);
    if (alpha < 0.02) discard;
    float tHit = 1e20;
    if (a0 > 0.02 && cum.y > 0.0) tHit = cum.y;
    if (a1 > 0.02 && alto.y > 0.0) tHit = min(tHit, alto.y);
    if (a2 > 0.02 && cir.y > 0.0) tHit = min(tHit, cir.y);
    if (tHit > 1e19) discard;
    vec3 hit = cameraPosition + rd * tHit;
    vec4 clipHit = projectionMatrix * viewMatrix * vec4(hit, 1.0);
    float w = clipHit.w;
    #if defined( USE_LOGDEPTHBUF ) || defined( USE_LOGARITHMIC_DEPTH_BUFFER )
      gl_FragDepth = min(log2(1.0 + max(w, 0.0)) * logDepthBufFC * 0.5, 0.9999);
    #else
      gl_FragDepth = w > 0.0 ? min(clipHit.z / w * 0.5 + 0.5, 0.9999) : 1.0;
    #endif
    gl_FragColor = vec4(color, alpha);
  }
`

/** Mid-latitude étages, metres above sea level. Low 1 km, middle 4 km, cirrus 9 km.
 * Storm drops the base and grows the low deck into a cumulonimbus toward the tropopause. */
function cloudDecks(storm: number) {
  const s = Math.min(1, Math.max(0, storm))
  return {
    cumBase: 1100 - s * 500,
    cumThick: 600 + s * 9500,
    altoBase: 4200 - s * 700,
    altoThick: 800 + s * 600,
    cirBase: 9000 - s * 1000,
    cirThick: 1600,
  }
}

interface Shared {
  cloudOrigin: { value: Vector3 }
  coverage: { value: number }
  dayHours: { value: number }
  golden: { value: number }
  day: { value: number }
  amount: { value: number }
  storm: { value: number }
  cumBase: { value: number }
  cumThick: { value: number }
  altoBase: { value: number }
  altoThick: { value: number }
  cirBase: { value: number }
  cirThick: { value: number }
}

function shareUniforms(material: ShaderMaterial, sun: Vector3, shared: Shared) {
  material.uniforms.sunDirection = { value: sun }
  material.uniforms.cloudOrigin = shared.cloudOrigin
  material.uniforms.coverage = shared.coverage
  material.uniforms.dayHours = shared.dayHours
  material.uniforms.golden = shared.golden
  material.uniforms.day = shared.day
  material.uniforms.amount = shared.amount
  material.uniforms.storm = shared.storm
  material.uniforms.cumBase = shared.cumBase
  material.uniforms.cumThick = shared.cumThick
  material.uniforms.altoBase = shared.altoBase
  material.uniforms.altoThick = shared.altoThick
  material.uniforms.cirBase = shared.cirBase
  material.uniforms.cirThick = shared.cirThick
}

function writeDecks(shared: Shared) {
  const decks = cloudDecks(shared.storm.value)
  shared.cumBase.value = decks.cumBase
  shared.cumThick.value = decks.cumThick
  shared.altoBase.value = decks.altoBase
  shared.altoThick.value = decks.altoThick
  shared.cirBase.value = decks.cirBase
  shared.cirThick.value = decks.cirThick
}

/** Shared with the ground so driving sees the same clouds that are overhead. */
export const groundCloudShade = `
${NOISE}
uniform vec3 nablaCloudSun;
uniform float nablaCloudHours;
uniform float nablaCloudDay;
uniform float nablaCloudAmount;
uniform float nablaCloudStorm;
uniform float nablaCloudBase;
uniform float nablaCloudCover;
float nablaGroundShade(vec2 xz) {
  vec3 sun = normalize(nablaCloudSun);
  vec2 shift = -sun.xz * min(nablaCloudBase / max(sun.y, 0.22), 8000.0);
  float thresh = clamp(mix(0.94, 0.15, nablaCloudAmount) - nablaCloudStorm * 0.08, 0.05, 0.97);
  float puff = cumulus(xz + shift, nablaCloudHours, thresh);
  float shade = clamp(puff * mix(0.12, 1.35, nablaCloudAmount), 0.0, 1.0);
  shade *= nablaCloudCover * nablaCloudDay * smoothstep(0.02, 0.2, sun.y);
  return shade;
}
`
export const groundCloudShadow = {
  sun: { value: new Vector3(0, 1, 0) },
  origin: { value: new Vector3() },
  dayHours: { value: 0 },
  day: { value: 1 },
  amount: { value: 0.4 },
  storm: { value: 0.12 },
  cumBase: { value: 1100 },
  coverage: { value: 1 },
}

/** One cumulus sample. Materials that already pay for lighting pick this up. */
export function patchGroundCloudShadow(shader: {
  vertexShader: string
  fragmentShader: string
  uniforms: Record<string, { value: unknown }>
}) {
  if (
    !shader.vertexShader.includes('#include <project_vertex>') ||
    !shader.fragmentShader.includes('reflectedLight.directDiffuse')
  )
    return
  shader.uniforms.nablaCloudSun = groundCloudShadow.sun
  shader.uniforms.nablaCloudOrigin = groundCloudShadow.origin
  shader.uniforms.nablaCloudHours = groundCloudShadow.dayHours
  shader.uniforms.nablaCloudDay = groundCloudShadow.day
  shader.uniforms.nablaCloudAmount = groundCloudShadow.amount
  shader.uniforms.nablaCloudStorm = groundCloudShadow.storm
  shader.uniforms.nablaCloudBase = groundCloudShadow.cumBase
  shader.uniforms.nablaCloudCover = groundCloudShadow.coverage
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 nablaCloudWorld;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nnablaCloudWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform vec3 nablaCloudSun;
      uniform vec3 nablaCloudOrigin;
      uniform float nablaCloudHours;
      uniform float nablaCloudDay;
      uniform float nablaCloudAmount;
      uniform float nablaCloudStorm;
      uniform float nablaCloudBase;
      uniform float nablaCloudCover;
      varying vec3 nablaCloudWorld;
      ${NOISE}`,
    )
    .replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `vec3 cloudPos = nablaCloudWorld;
      #if defined( USE_SHADOWMAP ) && ( NUM_SUN_LIGHT_SHADOWS > 0 )
        cloudPos = vSunShadowWorldPosition.xyz;
      #endif
      vec3 sun = normalize(nablaCloudSun);
      vec2 shift = -sun.xz * min(nablaCloudBase / max(sun.y, 0.22), 8000.0);
      float thresh = clamp(mix(0.94, 0.15, nablaCloudAmount) - nablaCloudStorm * 0.08, 0.05, 0.97);
      float puff = cumulus((cloudPos.xz + nablaCloudOrigin.xz) + shift, nablaCloudHours, thresh);
      float shade = clamp(puff * mix(0.12, 1.35, nablaCloudAmount), 0.0, 1.0);
      shade *= nablaCloudCover * nablaCloudDay * smoothstep(0.02, 0.2, sun.y);
      reflectedLight.directDiffuse *= mix(1.0, 0.46, shade);
      vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;`,
    )
}

function screenTriangle(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  geometry.computeBoundingSphere()
  return geometry
}

/** Local sheets, drawn after the world so they sit on the terrain. */
export function createArtisticClouds(sunDirection: Vector3) {
  groundCloudShadow.sun.value = sunDirection
  const shared: Shared = {
    cloudOrigin: groundCloudShadow.origin,
    coverage: groundCloudShadow.coverage,
    dayHours: groundCloudShadow.dayHours,
    golden: { value: 0 },
    day: groundCloudShadow.day,
    amount: groundCloudShadow.amount,
    storm: groundCloudShadow.storm,
    cumBase: groundCloudShadow.cumBase,
    cumThick: { value: 380 },
    altoBase: { value: 1450 },
    altoThick: { value: 260 },
    cirBase: { value: 3200 },
    cirThick: { value: 640 },
  }
  writeDecks(shared)
  const material = new ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDirection },
      cloudOrigin: shared.cloudOrigin,
      coverage: shared.coverage,
      dayHours: shared.dayHours,
      golden: shared.golden,
      day: shared.day,
      amount: shared.amount,
      storm: shared.storm,
      cumBase: shared.cumBase,
      cumThick: shared.cumThick,
      altoBase: shared.altoBase,
      altoThick: shared.altoThick,
      cirBase: shared.cirBase,
      cirThick: shared.cirThick,
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: true,
    side: FrontSide,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
  })
  shareUniforms(material, sunDirection, shared)
  const deck = new Mesh(screenTriangle(), material)
  deck.name = 'Artistic clouds'
  deck.frustumCulled = false
  deck.renderOrder = 4
  return {
    deck,
    cloudOrigin: shared.cloudOrigin,
    coverage: shared.coverage,
    dayHours: shared.dayHours,
    golden: shared.golden,
    day: shared.day,
    amount: shared.amount,
    storm: shared.storm,
    setWeather(amount: number, storm: number) {
      shared.amount.value = amount
      shared.storm.value = storm
      writeDecks(shared)
    },
  }
}

const globeVertex = `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vFragDepth;
  void main() {
    vLocal = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
    vFragDepth = 1.0 + gl_Position.w;
  }
`

const globeFragment = `
  uniform vec3 sunDirection;
  uniform float coverage;
  uniform float dayHours;
  uniform float amount;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vFragDepth;
  #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
    uniform float logDepthBufFC;
  #endif
  ${NOISE}
  void main() {
    vec2 uv = vec2(atan(vLocal.z, vLocal.x), vLocal.y) * 4.2;
    float wind = dayHours * 0.12;
    float f = fbm(uv + vec2(wind, wind * 0.35));
    float thresh = mix(0.92, 0.18, amount);
    float cloud = smoothstep(thresh, thresh + 0.16, f);
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - abs(dot(N, V)), 1.35);
    float lit = smoothstep(-0.06, 0.22, dot(N, normalize(sunDirection)));
    float body = mix(0.16, 0.9, amount);
    float alpha = cloud * (body + rim * (1.0 - body) * 0.4) * coverage * lit;
    if (alpha < 0.02) discard;
    #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
      gl_FragDepth = log2(max(vFragDepth, 1.0)) * logDepthBufFC * 0.5;
    #endif
    vec3 color = mix(vec3(0.12, 0.13, 0.16), vec3(0.96, 0.97, 0.98), lit);
    gl_FragColor = vec4(color, alpha);
  }
`

/** Skin on the globe. Front faces only, so it appears once the camera is outside it. */
export function createGlobeClouds(sunDirection: Vector3, radius: number) {
  const coverage = { value: 0 }
  const dayHours = { value: 0 }
  const amount = { value: 0.4 }
  const material = new ShaderMaterial({
    uniforms: {
      sunDirection: { value: sunDirection },
      coverage,
      dayHours,
      amount,
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: true,
    side: FrontSide,
    vertexShader: globeVertex,
    fragmentShader: globeFragment,
  })
  const mesh = new Mesh(new SphereGeometry(radius, 96, 64), material)
  mesh.name = 'Globe clouds'
  mesh.frustumCulled = false
  mesh.renderOrder = 1
  return { mesh, coverage, dayHours, amount }
}

/** Same noise as the globe skin, shifted toward the sun, darkening the earth underneath. */
export function shadeEarthWithClouds(
  material: MeshLambertMaterial,
  sunDirection: Vector3,
  coverage: { value: number },
  dayHours: { value: number },
  amount: { value: number },
) {
  material.customProgramCacheKey = () => 'earth-cloud-shadow'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nablaCloudSun = { value: sunDirection }
    shader.uniforms.nablaCloudCoverage = coverage
    shader.uniforms.nablaCloudHours = dayHours
    shader.uniforms.nablaCloudAmount = amount
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 cloudLocal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncloudLocal = normalize(position);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 nablaCloudSun;
        uniform float nablaCloudCoverage;
        uniform float nablaCloudHours;
        uniform float nablaCloudAmount;
        uniform mat4 modelMatrix;
        varying vec3 cloudLocal;
        ${NOISE}`,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
        vec3 n = normalize(cloudLocal);
        vec3 sun = normalize(transpose(mat3(modelMatrix)) * nablaCloudSun);
        float mu = dot(n, sun);
        vec3 shadowN = normalize(n + sun * (0.018 / max(mu, 0.12)));
        vec2 uv = vec2(atan(shadowN.z, shadowN.x), shadowN.y) * 4.2;
        float wind = nablaCloudHours * 0.12;
        float f = fbm(uv + vec2(wind, wind * 0.35));
        float thresh = mix(0.92, 0.18, nablaCloudAmount);
        float cloud = smoothstep(thresh, thresh + 0.16, f);
        float shadow = cloud * smoothstep(0.0, 0.2, mu) * nablaCloudCoverage;
        outgoingLight *= mix(1.0, 0.42, shadow);`,
      )
  }
}
