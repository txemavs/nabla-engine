// @ts-nocheck -- plain browser code ported unchanged from the Euskadi Online overlay; typing it is a follow-up.
/**
 * Default game HUD (first shipped by Euskadi Online): top-right action row with the menu clock and
 * its time slider, top-left menu button, place/date label, contextual key buttons at the bottom
 * right, status/help line, FPS and loading step at the bottom left. Hosts add branding and texts.
 * The html class `nabla-intro` hides the HUD while a host intro plays.
 */
import { installDefaultHudStyles } from './default-hud-styles.js'
import {
  formatClockTime,
  liveSkyClock,
  localMinutes,
  skyClockAtMinutes,
  skyClockAtRate,
  skyRate,
  skyTime,
  shiftSkyClockMinutes,
} from '@nabla/engine/planet/sky'
import * as navigationPlaces from '@nabla/engine/render/entity/navigation-places'
import { controlsFor, keyLabel } from '@nabla/engine/config/controls'
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 3.5V8h4.5"/><path d="M12 7.5V12l3 2"/></svg>'
const MENU_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
const syncMenuPointerLock = () => {
  const button = document.getElementById('nabla-hud-options-toggle')
  if (!button) return
  const locked = !!document.pointerLockElement
  const open = document.body.classList.contains('settings-is-open')
  if (button.dataset.pointerLocked === String(locked) && button.dataset.menuOpen === String(open))
    return
  button.dataset.menuOpen = String(open)
  button.dataset.pointerLocked = String(locked)
  if (open)
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 4l13 8-13 8z"/></svg>'
  else if (locked) button.textContent = 'Esc'
  else button.innerHTML = MENU_ICON
  button.title = open
    ? 'Volver al juego'
    : locked
      ? 'Pulsa Esc para liberar el cursor'
      : 'Abrir menú'
  button.setAttribute('aria-label', button.title)
}
document.addEventListener('pointerlockchange', syncMenuPointerLock)
new MutationObserver(syncMenuPointerLock).observe(document.body, {
  attributes: true,
  attributeFilter: ['class'],
})
const WHEEL_STEP = 40
// Static import with the exact URL the runtime's own modules use, so this is the same module
// instance the runtime fills (a dynamic import gets Vite's ?import query = an empty copy).
const nav = navigationPlaces
const runtime = () => {
  const r = hudRuntime || window.nablaRuntime
  return r && r.skyClock && typeof r.setSkyClock === 'function' ? r : null
}
const node = (tag, cls) => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  return el
}
const block = node('div', 'nabla-hud-place')
block.id = 'nabla-hud-place'
const row = node('div', 'nabla-hud-clock-row')
const clock = node('span', 'nabla-hud-clock')
clock.textContent = '--:--'
const real = node('button', 'nabla-hud-clock-real')
real.type = 'button'
real.textContent = 'SET'
real.setAttribute('aria-label', 'Hora real')
real.title = 'Hora real: sincroniza con el reloj actual (velocidad ×1)'
real.setAttribute('aria-pressed', 'false')
const clockControls = node('div', 'nabla-hud-time-controls')
clockControls.hidden = true
const timeSlider = node('input', 'nabla-vertical-range')
timeSlider.type = 'range'
timeSlider.min = '0'
timeSlider.max = '1440'
timeSlider.step = '1'
timeSlider.setAttribute('aria-label', 'Hora del día')
const timeBar = node('div', 'nabla-hud-time-bar')
timeBar.append(timeSlider)
clockControls.append(real, timeBar)
row.append(clock)
let bindingClock
let openingOptions = false
timeSlider.addEventListener('input', () => {
  const r = runtime()
  if (!r) return
  r.setSkyClock(
    shiftSkyClockMinutes(r.skyClock, Number(timeSlider.value) - localMinutes(skyTime(r.skyClock))),
  )
  showClock()
})
// Capture relative dragging so the thumb wraps instead of clamping at midnight.
let timeDrag
timeSlider.style.touchAction = 'none'
timeSlider.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  const r = runtime()
  if (!r) return
  e.preventDefault()
  e.stopPropagation()
  const rect = timeSlider.getBoundingClientRect()
  const span = Math.max(1, rect.height - 40)
  const value = Math.max(0, Math.min(1440, ((rect.bottom - 20 - e.clientY) / span) * 1440))
  const base = shiftSkyClockMinutes(r.skyClock, value - localMinutes(skyTime(r.skyClock)))
  timeDrag = { id: e.pointerId, y: e.clientY, span, base }
  timeSlider.setPointerCapture(e.pointerId)
  timeSlider.focus()
  r.setSkyClock(base)
  showClock()
})
timeSlider.addEventListener('pointermove', (e) => {
  if (!timeDrag || timeDrag.id !== e.pointerId) return
  e.preventDefault()
  e.stopPropagation()
  runtime()?.setSkyClock(
    shiftSkyClockMinutes(timeDrag.base, ((timeDrag.y - e.clientY) / timeDrag.span) * 1440),
  )
  showClock()
})
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
  timeSlider.addEventListener(event, () => {
    timeDrag = undefined
  })
timeSlider.addEventListener('keydown', (e) => {
  const delta = {
    ArrowUp: 1,
    ArrowDown: -1,
    ArrowRight: 1,
    ArrowLeft: -1,
    PageUp: 60,
    PageDown: -60,
  }[e.key]
  if (delta === undefined) return
  e.preventDefault()
  e.stopPropagation()
  const r = runtime()
  if (!r) return
  r.setSkyClock(shiftSkyClockMinutes(r.skyClock, delta))
  showClock()
})
timeSlider.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    e.stopPropagation()
    const r = runtime()
    if (!r || !e.deltaY) return
    r.setSkyClock(shiftSkyClockMinutes(r.skyClock, e.deltaY < 0 ? 60 : -60))
    showClock()
  },
  { passive: false },
)
for (const event of ['pointerdown', 'click', 'keydown', 'keyup', 'wheel'])
  clockControls.addEventListener(event, (e) => e.stopPropagation())
row.title = 'Hora del juego · rueda del ratón: ±1 hora'
const city = node('div', 'nabla-hud-city')
const street = node('div', 'nabla-hud-street')
block.append(row, city, street)
let helpSignature = ''
let messageLayoutSignature = ''
let welcomedAt = 0
const showControls = (r) => {
  const footer = document.getElementById('nabla-hud-footer')
  if (!footer) return
  let help = document.getElementById('nabla-hud-controls')
  if (!help) {
    help = node('span')
    help.id = 'nabla-hud-controls'
    footer.append(help)
  }
  const loading = document.getElementById('loading-screen')
  const state = document.querySelector('canvas[data-engine]')?.dataset
  const ready =
    state?.reveal === 'play' &&
    state?.startCameras !== 'active' &&
    (!loading || loading.classList.contains('hidden')) &&
    !document.documentElement.classList.contains('nabla-intro')
  if (!ready) {
    help.hidden = true
    return
  }
  if (ready && !welcomedAt) welcomedAt = Date.now()
  const context = r.controlContext || { mode: 'walk' }
  const bindings = controlsFor(context)
  const byAction = new Map(bindings.map((b) => [b.action, b]))
  const key = (action) => byAction.get(action)?.keys[0]
  const groups = []
  const add = (actions, label) => {
    const codes = actions.map(key).filter(Boolean)
    if (codes.length) groups.push({ codes, label })
  }
  if (ready && Date.now() - welcomedAt < 12000) {
    add(['move.forward', 'move.left', 'move.back', 'move.right'], 'para moverte o conducir')
    add(['interact'], 'para entrar o salir')
  } else if (context.mode === 'flight') {
    add(['flight.forward', 'flight.back', 'flight.left', 'flight.right'], 'cabeceo / alabeo')
    add(['flight.liftUp', 'flight.liftDown'], 'empuje')
    add(['flight.turnLeft', 'flight.turnRight'], 'rumbo')
    add(['camera'], 'cámara')
  } else if (context.mode === 'forklift') {
    add(['forklift.liftUp', 'forklift.liftDown'], 'horquillas')
    add(['forklift.tiltUp', 'forklift.tiltDown'], 'inclinar mástil')
    add(['forklift.sideLeft', 'forklift.sideRight'], 'desplazar')
  } else if (context.mode === 'bike') {
    add(['brake'], 'freno delantero')
    add(['move.back'], 'freno trasero')
    add(['camera'], 'cámara')
    add(['recover'], 'recuperar')
  } else if (context.mode === 'road') {
    add(['brake'], 'freno de mano')
    add(['camera'], 'cámara')
    add(['recover'], 'recuperar')
    add(['transmission'], 'modo de cambio')
    const id = r.session?.simulation?.player?.vehicleId
    const vehicle = r.document?.entities?.find((e) => e.id === id)?.vehicle
    if (vehicle?.hitch) add(['hitch'], 'enganchar / soltar')
  } else {
    add(['jump'], 'saltar')
    add(['sprint'], 'correr')
    add(['holster'], 'arma')
  }
  const held = new Set((document.getElementById('game-canvas')?.dataset.heldKeys || '').split(' '))
  const signature = JSON.stringify([groups, [...held]])
  if (signature === helpSignature) return
  helpSignature = signature
  help.replaceChildren()
  for (const [index, group] of groups.entries()) {
    if (index) help.append(document.createTextNode(' · '))
    for (const code of group.codes) {
      const kbd = node('kbd')
      kbd.textContent = keyLabel(code)
      kbd.classList.toggle('is-held', held.has(code))
      help.append(kbd)
    }
    help.append(document.createTextNode(' ' + group.label))
  }
}
const showClock = () => {
  const r = runtime()
  if (!r) {
    block.dataset.ready = '0'
    row.dataset.ready = '0'
    return
  }
  block.dataset.ready = '1'
  row.dataset.ready = '1'
  showControls(r)
  const sky = r.skyClock
  const rate = skyRate(sky)
  const text = formatClockTime(localMinutes(skyTime(sky)))
  const date = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(
    skyTime(sky),
  )
  for (const label of document.querySelectorAll('.nabla-hud-city, .touch-driving-city'))
    label.dataset.gameDate = date
  if (clock.textContent !== text) clock.textContent = text
  const menu = document.getElementById('settings-toggle')
  if (menu) {
    // Layout must be applied even when Engine already wrote this minute.
    menu.classList.add('nabla-hud-menu-clock')
    if (menu.textContent !== text) menu.textContent = text
  }
  if (menu) {
    let actions = document.getElementById('nabla-hud-actions')
    if (!actions) {
      actions = node('div')
      actions.id = 'nabla-hud-actions'
      document.body.append(actions)
    }
    let fixed = document.getElementById('nabla-hud-fixed')
    let contextBar = document.getElementById('nabla-hud-context')
    if (!fixed) {
      fixed = node('div')
      fixed.id = 'nabla-hud-fixed'
      actions.prepend(fixed)
    }
    if (!contextBar) {
      contextBar = node('div')
      contextBar.id = 'nabla-hud-context'
      actions.append(contextBar)
    }
    const running = document.querySelector('canvas[data-engine]')?.dataset
    actions.hidden = running?.reveal !== 'play' || running?.startCameras === 'active'
    const seatedVehicle = !!running?.vehicle
    const toolbar = document.querySelector('.game-toolbar')
    if (toolbar && toolbar.parentElement !== fixed) fixed.prepend(toolbar)
    const navigation = actions.querySelector('.game-toolbar-navigation')
    if (navigation && navigation.parentElement !== contextBar) contextBar.prepend(navigation)
    const weapons = actions.querySelector('.weapon-controls')
    if (weapons && weapons.parentElement !== contextBar) contextBar.append(weapons)
    for (const button of actions.querySelectorAll('button[data-toolbar-label]') ?? []) {
      const label = button.dataset.toolbarLabel
      const compact = ['ADD', 'RESET', 'IN/OUT'].includes(label)
      button.dataset.compact = String(compact)
      const seated = !!document.querySelector('canvas[data-engine]')?.dataset.vehicle
      const svg = (paths) =>
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        paths +
        '</svg>'
      const icon =
        label === 'ADD'
          ? svg('<path d="M12 5v14M5 12h14"/>')
          : label === 'RESET'
            ? svg(
                '<path d="M4 9a8 8 0 0 1 13-3l3 3M20 3v6h-6M20 15a8 8 0 0 1-13 3l-3-3M4 21v-6h6"/>',
              )
            : label === 'IN/OUT'
              ? svg(
                  seated
                    ? '<path d="M12 4v13m-5-5 5 5 5-5M5 21h14"/>'
                    : '<path d="M12 20V7m-5 5 5-5 5 5M5 3h14"/>',
                )
              : null
      if (label === 'IN/OUT') {
        const text = seated ? 'EXIT' : 'ENTER'
        if (!contextBar.contains(button) && button.textContent !== text) button.textContent = text
        button.hidden = !seated && !r.canEnterVehicle
      } else if (icon && !contextBar.contains(button)) {
        if (button.innerHTML !== icon) button.innerHTML = icon
      } else if (!contextBar.contains(button) && button.textContent !== label)
        button.textContent = label
      if (label === 'RESET') {
        button.hidden = !seated
        button.style.order = '90'
        if (button.parentElement !== contextBar) contextBar.append(button)
      }
      if (label === 'IN/OUT') {
        button.style.order = '100'
        if (button.parentElement !== contextBar) contextBar.append(button)
      }
      if (label === 'PLAY') button.hidden = true
      if (label === 'CAM') {
        button.style.order = '-1'
        if (toolbar && button.parentElement !== toolbar) toolbar.prepend(button)
      }
      const help = {
        FOV: 'Field of view',
        QLTY: 'Quality · Resolution scale',
        CAM: 'Camera',
        'IN/OUT': seated ? 'Exit vehicle' : 'Enter vehicle',
        RESET: 'Respawn',
        PLAY: 'Play',
        ADD: 'Add vehicle',
        AIM: 'Aim',
        MAG: 'Magazine',
        SLIDE: 'Slide',
      }[label]
      if (help) {
        button.title = help
        button.setAttribute('aria-label', help)
      }
    }
    let clockGroup = document.getElementById('nabla-hud-clock-group')
    if (!clockGroup) {
      clockGroup = node('div')
      clockGroup.id = 'nabla-hud-clock-group'
      fixed.append(clockGroup)
      clockGroup.append(clockControls)
    }
    if (menu.parentElement !== clockGroup) clockGroup.append(menu)
    if (bindingClock !== menu) {
      bindingClock = menu
      menu.addEventListener(
        'click',
        (e) => {
          if (openingOptions) return
          e.preventDefault()
          e.stopImmediatePropagation()
          clockControls.hidden = !clockControls.hidden
          menu.setAttribute('aria-expanded', String(!clockControls.hidden))
          if (!clockControls.hidden) document.exitPointerLock?.()
        },
        true,
      )
      const options = node('button')
      options.id = 'nabla-hud-options-toggle'
      options.type = 'button'
      options.innerHTML = MENU_ICON
      options.addEventListener('click', () => {
        openingOptions = true
        try {
          menu.click()
        } finally {
          openingOptions = false
        }
      })
      document.body.append(options)
      syncMenuPointerLock()
    }
    let torch = document.getElementById('nabla-hud-headlamp')
    if (seatedVehicle && torch) {
      torch.remove()
      torch = null
    }
    if (!torch && !seatedVehicle) {
      torch = node('button')
      torch.id = 'nabla-hud-headlamp'
      torch.type = 'button'
      torch.style.cssText = 'width:36px;height:36px;padding:0;display:grid;place-items:center'
      torch.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8h7v8H3zM10 8l4-3v14l-4-3M17 7l4-2M17 12h5M17 17l4 2"/></svg>'
      torch.addEventListener('click', () => {
        const r = runtime()
        if (r) r.setHeadlamp(!r.headlampEnabled)
        showClock()
      })
      contextBar.append(torch)
    }
    if (torch) {
      torch.setAttribute('aria-pressed', String(!!r.headlampEnabled))
      torch.hidden = seatedVehicle
      torch.disabled = seatedVehicle
      torch.title = seatedVehicle
        ? 'Usa los faros del vehículo'
        : r.headlampEnabled
          ? 'Apagar linterna'
          : 'Encender linterna'
      torch.setAttribute('aria-label', torch.title)
    }
    let weaponToggle = document.getElementById('nabla-hud-holster')
    const showWeapon = !seatedVehicle && r.weaponOwned
    if (!showWeapon && weaponToggle) {
      weaponToggle.remove()
      weaponToggle = null
    }
    if (showWeapon && !weaponToggle) {
      weaponToggle = node('button')
      weaponToggle.id = 'nabla-hud-holster'
      weaponToggle.type = 'button'
      weaponToggle.dataset.controlAction = 'holster'
      weaponToggle.addEventListener('click', (event) => {
        event.stopPropagation()
        runtime()?.performControl('holster')
        showClock()
      })
      contextBar.append(weaponToggle)
    }
    if (weaponToggle) {
      weaponToggle.title = r.controlContext?.weapon ? 'Guardar arma' : 'Sacar arma'
      weaponToggle.setAttribute('aria-label', weaponToggle.title)
      weaponToggle.setAttribute('aria-pressed', String(!!r.controlContext?.weapon))
    }
    if (!contextBar.querySelector('[data-vehicle-controls]')) {
      const group = node('div')
      group.dataset.vehicleControls = ''
      group.style.cssText = 'display:flex;gap:6px'
      for (const [action, label, title] of [
        ['lights', 'LIGHTS', 'Luces'],
        ['highBeam', 'HIGH', 'Largas / cortas'],
        ['horn', 'HORN', 'Claxon'],
        ['signal.left', '◀', 'Intermitente izquierdo'],
        ['signal.right', '▶', 'Intermitente derecho'],
      ]) {
        const button = node('button')
        button.type = 'button'
        button.textContent = label
        button.title = title
        button.setAttribute('aria-label', title)
        button.dataset.controlAction = action
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          runtime()?.performControl(action)
        })
        group.append(button)
      }
      contextBar.append(group)
    }
    contextBar.querySelector('[data-vehicle-controls]').hidden = !seatedVehicle
    const applicable = controlsFor(r.controlContext || { mode: 'walk' })
    for (const button of contextBar.querySelectorAll('[data-control-action]'))
      button.hidden =
        button.dataset.controlAction !== 'horn' &&
        !applicable.some((binding) => binding.action === button.dataset.controlAction)
    const activeBeam = r.vehicleActiveBeam
    for (const [action, channel] of [
      ['lights', 'low'],
      ['highBeam', 'high'],
    ]) {
      contextBar
        .querySelector('[data-control-action="' + action + '"]')
        ?.setAttribute('aria-pressed', String(activeBeam === channel))
    }
    // Keep the Engine's input catalogue as the source of keyboard hints.
    const paths = {
      camera:
        '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      recover: '<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',
      interact: seatedVehicle
        ? '<path d="M12 3v14m-5-5 5 5 5-5M4 21h16"/>'
        : '<path d="M12 21V7m-5 5 5-5 5 5M4 3h16"/>',
      'signal.left': '<path d="m11 5-7 7 7 7M4 12h16"/>',
      'signal.right': '<path d="m13 5 7 7-7 7M4 12h16"/>',
      lights: '<path d="M13 5c10 0 10 14 0 14ZM3 9l7-3M3 14l7-3M3 19l7-3"/>',
      highBeam: '<path d="M13 5c10 0 10 14 0 14ZM2 6h8M2 12h8M2 18h8"/>',
      horn: '<path d="M4 10h5l7-5v14l-7-5H4ZM19 8q5 4 0 8"/>',
      holster: '<path d="M3 6h17v6H11l-2 8H5l2-8H3ZM14 12v3h-4"/>',
      headlamp: '<path d="M3 8h7v8H3zM10 8l4-3v14l-4-3M17 7l4-2M17 12h5M17 17l4 2"/>',
      aim: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
      'weapon.magazine': '<path d="M8 3h8v18H8zM10 7h4m-4 4h4m-4 4h4"/>',
      'weapon.slide': '<path d="M4 8h16v7H4zM8 4 4 8l4 4"/>',
      play: '<path d="m7 3 14 9-14 9Z"/>',
    }
    const actionNames = {
      CAM: 'camera',
      RESET: 'recover',
      'IN/OUT': 'interact',
      AIM: 'aim',
      MAG: 'weapon.magazine',
      SLIDE: 'weapon.slide',
      PLAY: 'play',
    }
    for (const button of actions.querySelectorAll('button')) {
      const action =
        button.id === 'nabla-hud-headlamp'
          ? 'headlamp'
          : button.dataset.controlAction || actionNames[button.dataset.toolbarLabel]
      if (!paths[action]) continue
      const binding = applicable.find((item) => item.action === action)
      const key = binding?.keys[0] ? keyLabel(binding.keys[0]) : action === 'aim' ? 'RMB' : 'Clic'
      const svg =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        paths[action] +
        '</svg>'
      const html = action === 'camera' ? svg + '<span>CAM</span>' : '<kbd>' + key + '</kbd>' + svg
      if (button.innerHTML !== html) button.innerHTML = html
      button.dataset.contextIcon = 'true'
      if (action === 'camera')
        button.style.cssText =
          'display:flex;align-items:center;justify-content:center;gap:6px;order:-1;height:36px;min-width:64px;padding:0 8px'
    }
    const footerPanel = document.getElementById('nabla-hud-footer')
    if (footerPanel && footerPanel.parentElement !== actions) actions.append(footerPanel)
    const title = document.querySelector(
      '.touch-driving-city:not(.nabla-hud-nodata), .nabla-hud-city',
    )
    const titleWidth = title?.getBoundingClientRect().width || 0
    document.documentElement.style.setProperty('--nabla-hud-title-width', titleWidth + 'px')
    const footer = document.getElementById('nabla-hud-footer')
    const visibleMessage =
      footer?.querySelector('#nabla-hud-status:not(:empty)') ||
      footer?.querySelector('#nabla-hud-controls:not([hidden])')
    const available = innerWidth - titleWidth - 32
    const signature = JSON.stringify([innerWidth, titleWidth, visibleMessage?.textContent])
    if (signature !== messageLayoutSignature) {
      messageLayoutSignature = signature
      // Measure one unwrapped copy, so an existing line break cannot change the decision.
      let messageWidth = 0
      if (visibleMessage) {
        const copy = visibleMessage.cloneNode(true)
        copy.removeAttribute('id')
        copy.removeAttribute('hidden')
        copy.style.cssText =
          'position:fixed;left:-10000px;top:0;visibility:hidden;white-space:nowrap;width:max-content;max-width:none;'
        copy.style.font = '10px/12px Arial,sans-serif'
        copy.querySelectorAll('kbd').forEach((kbd) => {
          kbd.style.font = '700 10px/12px Arial,sans-serif'
        })
        document.body.append(copy)
        messageWidth = copy.getBoundingClientRect().width
        copy.remove()
      }
      document.body.classList.toggle(
        'nabla-hud-message-wrap',
        innerWidth <= 600 && messageWidth > available,
      )
    }
  }
  const isReal = sky.mode === 'live' && rate === 1
  timeBar.hidden = isReal
  real.textContent = isReal ? 'SET' : 'RT'
  real.title = isReal ? 'Ajustar hora' : 'Volver al tiempo real'
  real.setAttribute('aria-label', real.title)
  timeSlider.value = String(localMinutes(skyTime(sky)))
  timeSlider.setAttribute('aria-valuetext', text)
  const mode = isReal ? 'real' : sky.mode === 'live' ? 'running' : 'fixed'
  if (row.dataset.mode !== mode || row.dataset.rate !== String(rate)) {
    row.dataset.mode = mode
    row.dataset.rate = String(rate)
    real.classList.toggle('is-on', isReal)
    real.setAttribute('aria-pressed', String(isReal))
    clock.title = isReal
      ? 'Hora real (×1), sigue al reloj · rueda: ±1 hora'
      : mode === 'running'
        ? 'Hora del juego ×' + rate + ' · rueda: ±1 hora'
        : 'Hora fija · rueda: ±1 hora · botón: hora real'
  }
}
let placeLookup
const showPlace = () => {
  if (row.parentElement !== block || !nav) return
  const r = runtime()
  const p = r?.session?.simulation?.player?.position
  if (!p) return
  placeLookup ??= new nav.NavigationPlaceLookup()
  placeLookup.request(p, (c, s) => {
    if (city.textContent !== c) city.textContent = c === 'Localidad sin datos' ? '' : c
    if (street.textContent !== s) street.textContent = s
  })
}
/** When the local engine renders its own place block (city + street), put the clock above its city. */
const placeHome = () => {
  const engine = document.querySelector('.touch-driving-place')
  if (engine) {
    // Engine city label with no OSM places in the tile manifests: keep its slot, hide the filler.
    const engineCity = engine.querySelector('.touch-driving-city')
    if (engineCity)
      engineCity.classList.toggle(
        'nabla-hud-nodata',
        engineCity.textContent === 'Localidad sin datos',
      )
    if (row.parentElement !== engine) engine.prepend(row)
    if (block.isConnected) block.remove()
    document.body.classList.remove('nabla-hud-place-host')
  } else {
    if (row.parentElement !== block) block.prepend(row)
    if (!block.isConnected) document.body.append(block)
    document.body.classList.add('nabla-hud-place-host')
  }
}
real.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  e.stopPropagation()
})
real.addEventListener('click', (e) => {
  e.preventDefault()
  e.stopPropagation()
  const r = runtime()
  if (!r) return
  r.setSkyClock(
    r.skyClock.mode === 'live' && skyRate(r.skyClock) === 1
      ? skyClockAtMinutes(r.skyClock, localMinutes(skyTime(r.skyClock)))
      : liveSkyClock(1),
  )
  real.blur()
  showClock()
})
let wheelAcc = 0
row.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    e.stopPropagation()
    const r = runtime()
    if (!r) return
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1
    const delta = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit
    if (Math.sign(delta) !== Math.sign(wheelAcc)) wheelAcc = 0
    wheelAcc += delta
    if (Math.abs(wheelAcc) < WHEEL_STEP) return
    const hours = wheelAcc < 0 ? 1 : -1 // wheel up = later
    wheelAcc = 0
    const sky = r.skyClock
    const rate = skyRate(sky)
    const next = shiftSkyClockMinutes(sky, hours * 60)
    r.setSkyClock(rate === 1 ? next : skyClockAtRate(next, rate))
    showClock()
  },
  { passive: false },
)
const start = () => {
  placeHome()
  showClock()
  showPlace()
  setInterval(() => {
    placeHome()
    showClock()
  }, 250)
  setInterval(showPlace, 500)
}

function startStatus(): void {
  let footer = document.getElementById('nabla-hud-footer')
  if (!footer) {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<footer id="nabla-hud-footer" hidden><span id="nabla-hud-status" role="status"></span></footer>',
    )
    footer = document.getElementById('nabla-hud-footer')
  }
  const status = document.getElementById('nabla-hud-status')
  const fps = document.createElement('span')
  fps.id = 'nabla-hud-fps'
  fps.hidden = true
  document.body.append(fps)
  const perfLog = new URLSearchParams(location.search).get('perfLog') === '1'
  if (perfLog) {
    const copyButton = document.createElement('button')
    copyButton.textContent = 'Copiar log'
    copyButton.title = 'Copiar registro de rendimiento'
    copyButton.style.cssText =
      'order:11;font:inherit;font-size:12px;color:#eee;background:#252525;border:1px solid #555;border-radius:2px;padding:3px 7px;cursor:pointer;pointer-events:auto;margin-left:6px'
    footer.append(copyButton)
    const copyLog = async () => {
      const log =
        document.querySelector('canvas[data-engine]')?.dataset.stallLog ||
        'Todavía no hay cortes registrados'
      try {
        await navigator.clipboard.writeText(log)
        copyButton.textContent = 'Copiado'
        setTimeout(() => {
          copyButton.textContent = 'Copiar log'
        }, 1800)
      } catch {
        const box = document.createElement('textarea')
        box.value = log
        box.style.cssText = 'position:fixed;inset:15%;z-index:999999;background:#222;color:#fff'
        document.body.append(box)
        box.select()
        // Closes when it loses focus (no extra key binding outside the input catalog).
        box.addEventListener('blur', () => box.remove())
      }
    }
    copyButton.addEventListener('click', copyLog)
  }
  const tileDot = document.createElement('span')
  tileDot.textContent = '● '
  tileDot.style.color = '#ff4040'
  tileDot.title = 'Instalando celda'
  const progress = document.createElement('span')
  progress.id = 'nabla-hud-load-step'
  progress.textContent = 'Initializing application'
  document.body.append(progress)
  const technicalLoadText = (value) => {
    for (const [from, to] of [
      ['Cargando celdas ', 'Streaming terrain cells · '],
      ['Preparando audio', 'Loading audio'],
      ['Cargando modelos de vehículos', 'Loading vehicles'],
      ['Cargando modelos de armas', 'Loading weapons'],
      ['Compilando arma y cargadores', 'Preparing magazines'],
      ['Colocando vehículos y preparando el escenario', 'Preparing scene'],
      ['Esperando teselas, ortofotos y colisiones del terreno', 'Preloading digital twin'],
      ['Preparando poses, luces y materiales', 'Preparing poses, lights and materials'],
      ['Compilando efectos: humo, impactos y casquillos', 'Preparing special effects'],
      ['Compilando shaders: vista exterior', 'Preparing exterior shaders'],
      ['Compilando shaders: cabina', 'Preparing cockpit shaders'],
      ['Preparando espejos: ', 'Preparing mirrors: '],
      ['Subiendo texturas a la GPU', 'Uploading GPU textures'],
      ['Preparando cámaras de entrada', 'Mounting cameras'],
      ['Render inicial: ', 'Preparing view: '],
      ['Efectos para cámara ', 'Preparing camera effects · '],
      ['Arma para cámara ', 'Loading weapon · '],
      ['Compilando destrucción y fragmentos', 'Preparing destruction'],
      ['Precargando vehículo: ', 'Preparing vehicle simulation · '],
      ['GPU preparada · entrando al juego', 'Simulation ready'],
      ['Cargando aplicación', 'Initializing application'],
      ['Cargando el terreno', 'Streaming terrain'],
      ['Peticiones:', 'Requests:'],
      ['manifiestos', 'manifests'],
      ['descargas', 'downloads'],
      ['instalando', 'installing'],
      ['con error', 'failed'],
      ['celdas listas', 'cells ready'],
      ['celda lista', 'cell ready'],
      ['en camino', 'pending'],
      ['no existen en el servidor', 'unavailable on server'],
      ['no existe en el servidor', 'unavailable on server'],
      ['Último error:', 'Last error:'],
    ])
      value = value.split(from).join(to)
    return value
  }
  let lastStep = '',
    stepSince = performance.now()
  let lastMessage = '',
    until = 0
  const tick = () => {
    const message = (document.getElementById('game-message')?.textContent || '').trim()
    const loading = document.getElementById('loading-screen')
    const state = document.querySelector('canvas[data-engine]')?.dataset
    const ready =
      state?.reveal === 'play' &&
      state?.startCameras !== 'active' &&
      (!loading || loading.classList.contains('hidden')) &&
      !document.documentElement.classList.contains('nabla-intro')
    footer.hidden = !ready
    progress.hidden = ready
    if (!ready) {
      const step =
        state?.loadingDetail ||
        document.getElementById('loading-status')?.textContent?.trim() ||
        'Cargando aplicación'
      if (step !== lastStep) {
        lastStep = step
        stepSince = Number(state?.loadingDetailSince) || performance.now()
      }
      progress.textContent =
        technicalLoadText(step) +
        ' · ' +
        Math.max(0, (performance.now() - stepSince) / 1000).toFixed(1) +
        ' s'
    }
    if (message !== lastMessage) {
      lastMessage = message
      until = ready ? Date.now() + 5000 : 0
    }
    const measuredFps = document.querySelector('canvas[data-engine]')?.dataset.fps
    fps.hidden = !ready || measuredFps === undefined
    if (!fps.hidden) {
      tileDot.hidden = !perfLog || state?.tileInstallActive !== '1'
      fps.replaceChildren(
        tileDot,
        document.createTextNode(
          measuredFps +
            ' FPS' +
            (perfLog && state?.tileInstallDetail ? ' · ' + state.tileInstallDetail : '') +
            (perfLog && state?.stallDetail ? ' · Última ' + state.stallDetail : ''),
        ),
      )
    }
    const next = ready && Date.now() < until ? message : ''
    if (status.textContent !== next) status.textContent = next
    const help = document.getElementById('nabla-hud-controls')
    if (help) help.hidden = Boolean(next)
  }
  window.addEventListener('nabla-load-step', tick)
  window.addEventListener('nabla-stream-step', tick)
  tick()
  setInterval(tick, 250)
}

let hudRuntime = null
/** Hand the HUD its GameRuntime (window.nablaRuntime exists only with ?diagnostics). */
export function setHudRuntime(runtime: unknown): void {
  hudRuntime = runtime
}

let started = false
/** Mount the HUD once (idempotent). */
export function mountDefaultHud(): void {
  if (started) return
  started = true
  const run = () => {
    installDefaultHudStyles()
    startStatus()
    start()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run)
  else run()
}
