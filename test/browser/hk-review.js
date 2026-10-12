import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Sidearm } from '../../src/runtime/sidearm.ts'
import { weaponPreset } from '../../src/catalog/weapons/index.ts'
import { VehicleAudio } from '../../src/audio/vehicle.ts'
import { hkVariants } from '../../src/simulation/weapons/hk-variants.ts'
import { applyReviewedPose, magazineRoundsForPreview } from './hk-presentation.mjs'
const hkCompact = weaponPreset('hk-compact')
const rig = await fetch(hkCompact.rig).then((r) => r.json())

const $ = (id) => document.getElementById(id)
const renderer = new T.WebGLRenderer({ canvas: $('view'), antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = T.ACESFilmicToneMapping
const scene = new T.Scene()
scene.background = new T.Color('#333e4b')
const pmrem = new T.PMREMGenerator(renderer)
const room = new RoomEnvironment()
scene.environment = pmrem.fromScene(room).texture
room.dispose()
pmrem.dispose()
scene.add(new T.HemisphereLight(0xe5f0ff, 0x454350, 2))
const key = new T.DirectionalLight(0xffffff, 3)
key.position.set(-1, 2, 1)
scene.add(key)
const camera = new T.PerspectiveCamera(35, 1, 0.001, 10)
const controls = new OrbitControls(camera, renderer.domElement)
controls.minDistance = 0.045
controls.maxDistance = 1.5
controls.enableDamping = true
const holder = new T.Group()
scene.add(holder)
const pistol = new Sidearm(document.body, hkCompact)
const audio = new VehicleAudio()
for (const variant of hkVariants) {
  const option = document.createElement('option')
  option.value = variant.id
  option.textContent = variant.name
  $('variant').append(option)
}
function syncControls() {
  $('decock').disabled = !pistol.variant.decocker
  $('safety').disabled = !pistol.variant.safety
  $('cock').disabled = pistol.variant.dao
  $('safety').textContent = 'Seguro: ' + (pistol.safe ? 'ON' : 'OFF')
}
$('variant').onchange = () => {
  pistol.setVariant($('variant').value)
  syncControls()
}
$('decock').onclick = () => {
  audio.unlock()
  pistol.decock()
  audio.weaponSound('dry-cocked', soundPosition('HammerPivot'))
}
$('cock').onclick = () => {
  audio.unlock()
  pistol.cock()
  audio.weaponSound('slide-lock', soundPosition('HammerPivot'))
}
$('safety').onclick = () => {
  audio.unlock()
  audio.weaponSound('safety', soundPosition('SafetyLeverPivot'))
  pistol.setSafety(!pistol.safe)
  syncControls()
}
$('metal').onclick = () => {
  audio.unlock()
  audio.metalImpact([0.4, 0.1, -0.5])
}
syncControls()
await pistol.ready
if (!pistol.model.getObjectByName('GuardGripCurvedJoin'))
  throw new Error('No se ha cargado la revisión 11')
pistol.visible = true
pistol.setTrainingLoad(4, 1)
$('load').onchange = () =>
  pistol.setTrainingLoad(Number($('load').value), Number($('load').value) === 0 ? 0 : 1)
let time = 10000,
  paused = false,
  manualSlide = null,
  reloadStart = null,
  releaseAt = null
let inspectionPoseUntil = 0,
  inspectMagazine = false,
  detachedMagazineRounds = 0
function beginInspect(chamber) {
  inspectionPoseUntil = Infinity
  pistol.inspect(time, chamber)
}
function endInspect() {
  inspectionPoseUntil = time + 300
  pistol.stopInspect(time)
}
function updateMagazinePreview(world) {
  const magazine = world.getObjectByName('Magazine'),
    source = world.getObjectByName('ChamberRound')
  if (!magazine || !source) return
  let top = magazine.getObjectByName('MagazineTopRound')
  if (!top) {
    top = source.clone(true)
    top.name = 'MagazineTopRound'
    const origin = new T.Vector3(0.0000705, 0.113392, -0.001),
      seat = new T.Vector3(0.00061, 0.0657, 0.0128)
    top.rotation.x = -0.08
    top.position.copy(seat).sub(origin.applyAxisAngle(new T.Vector3(1, 0, 0), top.rotation.x))
    magazine.add(top)
  }
  const state = pistol.state
  const count = magazineRoundsForPreview(
    state,
    hkCompact.firearm.magazineCapacity,
    detachedMagazineRounds,
  )
  top.visible = count > 0
  const shown = inspectMagazine || (state.reload === 'none' && !state.magazineSeated)
  magazine.userData.previewBlend = T.MathUtils.lerp(
    magazine.userData.previewBlend ?? 0,
    shown ? 1 : 0,
    0.16,
  )
  if (shown || magazine.userData.previewBlend > 0.001) {
    magazine.visible = true
    magazine.position.lerp(new T.Vector3(0.075, -0.018, 0.025), magazine.userData.previewBlend)
  }
  $('magazinePreview').textContent = inspectMagazine ? 'Volver del cargador' : 'Ver cargador'
  $('magazinePreview').setAttribute('aria-pressed', String(inspectMagazine))
}
const flash = new T.PointLight(0xffb357, 0, 0.3)
flash.position.set(0, 0.108, -0.125)
scene.add(flash)
const originals = new Map()
const ejectedRounds = []
function showEjectedRound(event) {
  if (!event.cartridgeEjected) return
  const source = holder.getObjectByName('ChamberRound')
  if (!source) return
  const object = source.clone(true)
  source.getWorldPosition(object.position)
  source.getWorldQuaternion(object.quaternion)
  object.visible = true
  scene.add(object)
  ejectedRounds.push({ object, start: performance.now(), origin: object.position.clone() })
}
let accessoryEffects = null
const updateAccessoryControls = () => {
  for (const id of ['torch', 'redLaser']) {
    $(id).disabled = !$('accessory').checked
    if (!$('accessory').checked) $(id).checked = false
  }
}
$('accessory').onchange = updateAccessoryControls
function updateAccessory(world) {
  const module = world.getObjectByName('LightLaserModule')
  if (!module) return
  module.visible = $('accessory').checked
  if (!accessoryEffects || accessoryEffects.module !== module) {
    const torch = new T.SpotLight(0xfff4df, 0, 2, 0.28, 0.55, 2)
    torch.position.copy(module.getObjectByName('TorchSocket').position)
    const target = new T.Object3D()
    target.position.copy(torch.position).add(new T.Vector3(0, 0, -1))
    torch.target = target
    module.add(torch, target)
    const laser = new T.Line(
      new T.BufferGeometry().setFromPoints([
        module.getObjectByName('RedLaserSocket').position.clone(),
        module
          .getObjectByName('RedLaserSocket')
          .position.clone()
          .add(new T.Vector3(0, 0, -0.25)),
      ]),
      new T.LineBasicMaterial({
        color: 0xff1a16,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      }),
    )
    laser.name = 'ModuleRedLaserPreview'
    const dot = new T.Mesh(
      new T.SphereGeometry(0.0012, 12, 8),
      new T.MeshBasicMaterial({ color: 0xff251c }),
    )
    dot.position
      .copy(module.getObjectByName('RedLaserSocket').position)
      .add(new T.Vector3(0, 0, -0.25))
    module.add(laser, dot)
    accessoryEffects = { module, torch, laser, dot }
  }
  accessoryEffects.torch.intensity = $('torch').checked ? 5 : 0
  accessoryEffects.laser.visible = accessoryEffects.dot.visible = $('redLaser').checked
  const torchLens = module.getObjectByName('TorchLens')
  const laserLens = module.getObjectByName('RedLaserLens')
  if (torchLens?.material.emissive)
    torchLens.material.emissive.setHex($('torch').checked ? 0xfff2cd : 0)
  if (laserLens?.material.emissive)
    laserLens.material.emissive.setHex($('redLaser').checked ? 0xff1209 : 0x220000)
}
function frameView(kind) {
  const views = {
    three: [0.29, 0.24, 0.32],
    front: [0, 0.112, -0.42],
    rear: [0, 0.12, 0.35],
    left: [-0.4, 0.11, -0.03],
    right: [0.4, 0.11, -0.03],
    top: [0, 0.48, -0.03],
  }
  camera.position.fromArray(views[kind])
  controls.target.set(0, 0.075, -0.03)
  controls.update()
}
frameView('three')
function resize() {
  renderer.setSize(innerWidth, innerHeight)
  camera.setViewOffset(
    innerWidth,
    innerHeight,
    innerWidth > 700 ? -145 : 0,
    0,
    innerWidth,
    innerHeight,
  )
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()
function action(kind) {
  audio.unlock()
  manualSlide = null
  paused = false
  $('pause').textContent = 'Pausar'
  if (kind === 'fire') {
    const event = pistol.pull(time)
    if (event.fired) {
      audio.gunshot([0, 0.108, -0.118], event.locked)
      if ($('testMetal').checked) audio.metalImpact([0.4, 0.1, -0.5])
      releaseAt = time + 70
      flash.intensity = 1
    } else if (event.dry) {
      audio.weaponSound('dry', soundPosition('Trigger'))
      releaseAt = time + 110
    }
  } else {
    inspectMagazine = false
    if (kind === 'reload' || kind === 'magazine-out') detachedMagazineRounds = pistol.state.magazine
    pistol.release()
    const step = kind === 'reload' ? 'magazine-out' : kind
    if (pistol.manipulate(step, time).reloadStarted) {
      if (step === 'magazine-out')
        audio.weaponSound('magazine-release', soundPosition('MagazineReleasePivot'))
      if (step === 'slide-release') audio.weaponSound('slide-back', soundPosition('Slide'))
    }
  }
}
function soundPosition(part) {
  const node = holder.getObjectByName(part)
  return node ? node.getWorldPosition(new T.Vector3()).toArray() : [0, 0.1, 0]
}
function beginReviewReload() {
  // Start an empty reload so every presentation phase can be inspected.
  pistol.setTrainingLoad(0, 0)
  pistol.reload(time)
  reloadStart = time
  releaseAt = null
  flash.intensity = 0
}
$('fire').onclick = () => action('fire')
$('magazinePreview').onclick = () => {
  inspectMagazine = !inspectMagazine
}
$('reload').onclick = () => action('reload')
$('insertMagazine').onclick = () => action('magazine-in')
$('rackSlide').onclick = () => action('slide-release')
$('pause').onclick = () => {
  paused = !paused
  if (!paused) manualSlide = null
  $('pause').textContent = paused ? 'Continuar' : 'Pausar'
}
$('reset').onclick = () => location.reload()
$('refresh').onclick = () => location.reload()
for (const [id, chamber] of [
  ['inspectModel', false],
  ['inspectChamber', true],
]) {
  const button = $(id)
  button.onpointerdown = (e) => {
    button.setPointerCapture(e.pointerId)
    paused = false
    manualSlide = null
    $('pause').textContent = 'Pausar'
    beginInspect(chamber)
  }
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = endInspect
  button.onkeydown = (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      e.preventDefault()
      e.stopPropagation()
      paused = false
      manualSlide = null
      beginInspect(chamber)
    }
  }
  button.onkeyup = (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      endInspect()
    }
  }
}
$('angle').onchange = () => frameView($('angle').value)
$('speed').oninput = () => {
  $('speedValue').textContent = Number($('speed').value) + '×'
}
$('slide').oninput = () => {
  audio.unlock()
  paused = true
  manualSlide = Number($('slide').value)
  const event = pistol.moveSlide(manualSlide, time)
  showEjectedRound(event)
  if (event.cartridgeEjected) audio.weaponSound('slide-lock', soundPosition('ChamberRound'))
  if (event.slideReleased) audio.weaponSound('slide-forward', soundPosition('Slide'))
  $('pause').textContent = 'Continuar'
}
$('timeline').oninput = () => {
  // Scrubbing restarts the actual gameplay state, then advances it to the chosen time.
  beginReviewReload()
  time += Number($('timeline').value) * hkCompact.firearm.reloadMs.slideRelease
  $('progress').textContent = Math.round(Number($('timeline').value) * 100) + ' %'
  releaseAt = null
  flash.intensity = 0
  paused = true
  manualSlide = null
  $('pause').textContent = 'Continuar'
}
addEventListener('keydown', (e) => {
  if (e.target.matches('input,select,button,textarea') || e.repeat) return
  if (e.code === 'Space') {
    e.preventDefault()
    action('fire')
  }
  if (e.code === 'KeyR' && !e.repeat) action('reload')
  if (e.code === 'KeyP') $('pause').click()
  if ((e.code === 'KeyZ' || e.code === 'KeyX') && !e.repeat) {
    paused = false
    manualSlide = null
    audio.unlock()
    beginInspect(e.code === 'KeyX')
    if (e.code === 'KeyX') audio.weaponSound('slide-back', [0, 0.1, 0])
  }
})
addEventListener('keyup', (e) => {
  if (e.code === 'KeyZ' || e.code === 'KeyX') {
    endInspect()
    if (e.code === 'KeyX') audio.weaponSound('slide-forward', [0, 0.1, 0])
  }
})
addEventListener('blur', () => {
  endInspect()
  pistol.release()
})
let last = performance.now()
renderer.setAnimationLoop((now) => {
  if (!paused) time += Math.min(now - last, 100) * Number($('speed').value)
  last = now
  if (releaseAt !== null && time >= releaseAt) {
    pistol.release()
    audio.weaponSound('trigger-reset', soundPosition('Trigger'))
    releaseAt = null
    flash.intensity = 0
  }
  const event = pistol.update(time)
  showEjectedRound(event)
  if (event.magazineDropped)
    audio.weaponSound('magazine-out', soundPosition('MagazineReleasePivot'))
  if (event.magazineSeated) audio.weaponSound('magazine-in', soundPosition('Magazine'))
  if (event.slideReleased) audio.weaponSound('slide-forward', soundPosition('Slide'))
  pistol.syncWorld(holder, time, false)
  const world = holder.getObjectByName('EquippedSidearm')
  if (world) {
    // Keep the gameplay part animations but frame the model on a stationary workbench.
    world.position.set(0, 0, 0)
    // Bench animation: only explicit inspection rotates the entire model.
    if (time < inspectionPoseUntil) world.quaternion.copy(pistol.model.quaternion)
    else world.quaternion.identity()
    const assembly = world.children[0]
    assembly.position.set(0, 0, 0)
    assembly.rotation.set(0, 0, 0)
    if (manualSlide !== null) {
      const slide = world.getObjectByName('Slide')
      slide.position.z = manualSlide * rig.presentation.slide.travel
    }
    applyReviewedPose(world, rig.presentation.slide.travel, pistol.triggerAction)
    updateMagazinePreview(world)
    world.traverse((node) => {
      if (!node.isMesh) return
      if (!originals.has(node)) originals.set(node, node.material)
      if ($('light').checked) {
        if (!node.userData.reviewMaterial)
          node.userData.reviewMaterial = [].concat(originals.get(node)).map(
            (material) =>
              new T.MeshStandardMaterial({
                color: 0xaab1b7,
                roughness: 0.45,
                metalness: 0.35,
                normalMap: material.normalMap,
                normalScale: material.normalScale?.clone(),
              }),
          )
        node.material = Array.isArray(originals.get(node))
          ? node.userData.reviewMaterial
          : node.userData.reviewMaterial[0]
      } else node.material = originals.get(node)
      for (const m of [].concat(node.material)) m.wireframe = $('wire').checked
    })
    updateAccessory(world)
  }
  const ammo = pistol.ammo
  $('status').textContent = `Cargador: ${ammo.magazine} · Recámara: ${ammo.chamber}`
  $('status').textContent += ` · ${pistol.triggerAction === 'single' ? 'Simple' : 'Doble'} acción`
  $('thermal').textContent =
    `Temperatura estimada · cañón ${pistol.temperature.barrelC.toFixed(1)} °C · corredera ${pistol.temperature.slideC.toFixed(1)} °C`
  if (reloadStart !== null && !paused) {
    const p = Math.min(1, (time - reloadStart) / hkCompact.firearm.reloadMs.slideRelease)
    $('timeline').value = p
    $('progress').textContent = Math.round(p * 100) + ' %'
  }
  $('slideValue').textContent =
    manualSlide === null ? 'Animada' : Math.round(manualSlide * 100) + ' %'
  if (manualSlide === null && world?.getObjectByName('Slide'))
    $('slide').value = Math.max(
      0,
      Math.min(1, world.getObjectByName('Slide').position.z / rig.presentation.slide.travel),
    )
  controls.update()
  for (let i = ejectedRounds.length - 1; i >= 0; i--) {
    const round = ejectedRounds[i],
      age = (now - round.start) / 1000
    if (age > 1.2) {
      scene.remove(round.object)
      ejectedRounds.splice(i, 1)
    } else {
      round.object.position
        .copy(round.origin)
        .add(new T.Vector3(age * 0.16, age * 0.15 - age * age * 0.35, age * 0.04))
      round.object.rotateX(0.08)
    }
  }
  audio.setListener(camera.position.toArray(), camera.quaternion.toArray())
  renderer.render(scene, camera)
  window.reviewReady = !!world
  window.hkReview = { pistol, audio, world, time }
})
