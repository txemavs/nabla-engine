import { describe, expect, it } from 'vitest'
import {
  TouchDriving,
  driveHandbrakePull,
  drivePilotAngle,
  drivePilotSteer,
  driveSliderThrottle,
  driveWheelSteer,
} from '../../src/runtime/touch-driving.js'
import { GameInput } from '../../src/runtime/input.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { createRuntimeText } from '../../src/runtime/messages.js'

describe('agency-ui drive pad mapping', () => {
  it('maps the lever: top is pulled, bottom is rest', () => {
    expect(driveHandbrakePull(-1)).toBe(1)
    expect(driveHandbrakePull(1)).toBe(0)
    expect(driveHandbrakePull(0)).toBeCloseTo(0.5)
    expect(driveHandbrakePull(Number.NaN)).toBe(0)
  })

  it('gas slider is opposite: top is throttle', () => {
    expect(driveSliderThrottle(-1)).toBe(1)
    expect(driveSliderThrottle(1)).toBe(-1)
    expect(driveSliderThrottle(Number.NaN)).toBe(0)
  })

  it('wheel nx is steer', () => {
    expect(driveWheelSteer(-1)).toBe(-1)
    expect(driveWheelSteer(1)).toBe(1)
    expect(driveWheelSteer(0.4)).toBeCloseTo(0.4)
    expect(driveWheelSteer(Number.NaN)).toBe(0)
  })

  it('pilot twist uses ~135° of rim for full lock', () => {
    expect(drivePilotAngle(0, -1)).toBeCloseTo(0)
    expect(drivePilotSteer(Math.PI * 0.75, 0, 0)).toBeCloseTo(1)
    expect(drivePilotSteer(-Math.PI * 0.75, 0, 0)).toBeCloseTo(-1)
    expect(drivePilotSteer(0.2, 0.2, 0.3)).toBeCloseTo(0.3)
  })
})

type Fake = {
  className: string
  dataset: Record<string, string>
  style: Record<string, string>
  children: Fake[]
  textContent: string
  classList: { toggle(name: string, on?: boolean): void; contains(name: string): boolean }
  onpointerdown?: (e: FakePointer) => void
  onpointermove?: (e: FakePointer) => void
  onpointerup?: (e: FakePointer) => void
  onpointercancel?: (e: FakePointer) => void
  onlostpointercapture?: (e: FakePointer) => void
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
  append(...nodes: Fake[]): void
  remove(): void
  setPointerCapture(): void
  releasePointerCapture(): void
  hasPointerCapture(): boolean
  getBoundingClientRect(): {
    left: number
    top: number
    width: number
    height: number
    right: number
    bottom: number
  }
  querySelector(sel: string): Fake | null
  querySelectorAll(sel: string): Fake[]
}

type FakePointer = {
  pointerId: number
  clientX: number
  clientY: number
  currentTarget: Fake
  preventDefault(): void
  stopPropagation(): void
}

function installDom() {
  class El {
    className = ''
    dataset: Record<string, string> = {}
    style: Record<string, string> = {}
    children: El[] = []
    attrs: Record<string, string> = {}
    _text = ''
    box = { left: 0, top: 0, width: 100, height: 100 }
    onpointerdown?: (e: FakePointer) => void
    onpointermove?: (e: FakePointer) => void
    onpointerup?: (e: FakePointer) => void
    onpointercancel?: (e: FakePointer) => void
    onlostpointercapture?: (e: FakePointer) => void
    get textContent(): string {
      return this._text + this.children.map((child) => child.textContent).join('')
    }
    set textContent(value: string) {
      this._text = value
    }
    classList = {
      toggle: (name: string, on?: boolean) => {
        const parts = new Set(this.className.split(/\s+/).filter(Boolean))
        if (on ?? !parts.has(name)) parts.add(name)
        else parts.delete(name)
        this.className = [...parts].join(' ')
      },
      contains: (name: string) => this.className.split(/\s+/).includes(name),
    }
    setAttribute(name: string, value: string) {
      this.attrs[name] = value
    }
    getAttribute(name: string) {
      return this.attrs[name] ?? this.dataset[name.replace(/^data-/, '')] ?? null
    }
    append(...nodes: El[]) {
      this.children.push(...nodes)
    }
    remove() {}
    setPointerCapture() {}
    releasePointerCapture() {}
    hasPointerCapture() {
      return false
    }
    getBoundingClientRect() {
      return {
        ...this.box,
        right: this.box.left + this.box.width,
        bottom: this.box.top + this.box.height,
      }
    }
    querySelector(sel: string) {
      return walk(this, sel)[0] ?? null
    }
    querySelectorAll(sel: string) {
      return walk(this, sel)
    }
  }

  function walk(node: El, sel: string): El[] {
    const out: El[] = []
    const visit = (el: El) => {
      if (match(el, sel)) out.push(el)
      for (const child of el.children) visit(child)
    }
    for (const child of node.children) visit(child)
    return out
  }

  function match(el: El, sel: string) {
    if (sel.startsWith('.')) return el.className.split(/\s+/).includes(sel.slice(1))
    const attr = sel.match(/^\[([^=\]]+)(?:=\"([^\"]*)\")?\]$/)
    if (attr) {
      const key = attr[1]!.startsWith('data-') ? attr[1]!.slice(5) : attr[1]!
      const value = el.dataset[key] ?? el.attrs[attr[1]!]
      return attr[2] === undefined ? value !== undefined : value === attr[2]
    }
    return false
  }

  const documentRef = {
    createElement: () => new El(),
    addEventListener() {},
  }
  Object.assign(globalThis, {
    document: documentRef,
    window: { addEventListener() {} },
  })
  return { El, documentRef }
}

const dom = installDom()

function host() {
  return document.createElement('div') as unknown as Fake
}

function pick(root: Fake, sel: string) {
  return root.querySelector(sel) as Fake
}

function fire(
  el: Fake,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
  id = 1,
) {
  el[`on${type}`]?.({
    pointerId: id,
    clientX: x,
    clientY: y,
    currentTarget: el,
    preventDefault() {},
    stopPropagation() {},
  })
}

describe('TouchDriving Studio rig', () => {
  it('draws the wheel, accelerator and red handbrake instead of circular pads', () => {
    const root = host()
    const hud = new TouchDriving(
      root as unknown as HTMLElement,
      { interact() {}, camera() {} },
      'always',
    )
    expect(root.querySelector('.touch-dpad')).toBeNull()
    expect(root.querySelector('[data-drive="wheel"]')).toBeTruthy()
    expect(root.querySelector('[data-drive="gas"]')).toBeTruthy()
    expect(root.querySelector('[data-drive="handbrake"]')).toBeTruthy()
    expect(root.querySelector('[data-drive="turbo"]')).toBeTruthy()
    expect(root.querySelector('.touch-driving-rim')).toBeTruthy()
    expect(root.querySelector('.touch-driving-knob')).toBeTruthy()
    expect(root.querySelector('.touch-driving-hb-dot')).toBeTruthy()
    expect(root.textContent).not.toContain('Steer')
    expect(root.textContent).not.toContain('Pedals')
    hud.dispose()
  })

  it('labels the Spanish rig without inventing Pedales pads', () => {
    const root = host()
    const hud = new TouchDriving(
      root as unknown as HTMLElement,
      { interact() {}, camera() {} },
      'always',
      createRuntimeText('es'),
    )
    expect(root.querySelector('[data-drive="wheel"]')?.getAttribute('aria-label')).toBe('Volante')
    expect(root.querySelector('[data-drive="gas"]')?.getAttribute('aria-label')).toBe('Acelerador')
    expect(root.querySelector('[data-drive="handbrake"]')?.getAttribute('aria-label')).toBe(
      'Freno de mano',
    )
    hud.dispose()
  })

  it('reads analog throttle, steer, latched handbrake and turbo', () => {
    const root = host()
    const hud = new TouchDriving(
      root as unknown as HTMLElement,
      { interact() {}, camera() {} },
      'always',
    )
    hud.setActive(true)
    const gas = pick(root, '[data-drive="gas"]')
    const wheel = pick(root, '[data-drive="wheel"]')
    const lever = pick(root, '[data-drive="handbrake"]')
    const turbo = pick(root, '[data-drive="turbo"]')
    Object.assign(gas, { box: { left: 0, top: 0, width: 48, height: 140 } })
    Object.assign(wheel, { box: { left: 200, top: 0, width: 148, height: 148 } })
    Object.assign(lever, { box: { left: 0, top: 0, width: 56, height: 72 } })
    fire(gas, 'pointerdown', 24, 10)
    expect(hud.input().forward).toBeGreaterThan(0.8)
    fire(wheel, 'pointerdown', 340, 74, 2)
    expect(hud.input().right).toBeGreaterThan(0.8)
    fire(turbo, 'pointerdown', 10, 10, 3)
    expect(hud.input().sprint).toBe(true)
    fire(lever, 'pointerdown', 28, 4, 4)
    fire(lever, 'pointerup', 28, 4, 4)
    expect(hud.input().brake).toBe(true)
    expect(hud.busy()).toBe(true)
    fire(gas, 'pointerup', 24, 10)
    fire(wheel, 'pointerup', 274, 74, 2)
    fire(turbo, 'pointerup', 10, 10, 3)
    expect(hud.input()).toEqual({ forward: 0, right: 0, brake: true, sprint: false })
    hud.dispose()
  })

  it('releases the handbrake when the lever is dropped below the latch', () => {
    const root = host()
    const hud = new TouchDriving(
      root as unknown as HTMLElement,
      { interact() {}, camera() {} },
      'always',
    )
    hud.setActive(true)
    const lever = pick(root, '[data-drive="handbrake"]')
    Object.assign(lever, { box: { left: 0, top: 0, width: 56, height: 72 } })
    fire(lever, 'pointerdown', 28, 68)
    fire(lever, 'pointerup', 28, 68)
    expect(hud.input().brake).toBe(false)
    hud.dispose()
  })

  it('follows reflected keyboard axes when the pads are idle', () => {
    const root = host()
    const hud = new TouchDriving(
      root as unknown as HTMLElement,
      { interact() {}, camera() {} },
      'always',
    )
    hud.setActive(true)
    hud.reflect({ forward: 1, right: -0.5, brake: true, sprint: true })
    const knob = pick(root, '.touch-driving-knob')
    const rim = pick(root, '.touch-driving-rim')
    expect(knob.style.top).toBe('8%')
    expect(rim.style.transform).toBe('rotate(52.5deg)')
    expect(root.querySelector('.touch-driving-lever')!.classList.contains('is-on')).toBe(true)
    expect(root.querySelector('.touch-driving-turbo')!.classList.contains('is-on')).toBe(true)
    hud.setPilot(true)
    expect(hud.root.classList.contains('is-pilot')).toBe(true)
    hud.dispose()
  })

  it('does not command while idle, then engages play', () => {
    const root = host()
    let played = 0
    const hud = new TouchDriving(
      root as unknown as HTMLElement,
      { play: () => played++, interact() {}, camera() {} },
      'always',
    )
    const gas = pick(root, '[data-drive="gas"]')
    Object.assign(gas, { box: { left: 0, top: 0, width: 48, height: 140 } })
    fire(gas, 'pointerdown', 24, 10)
    expect(hud.input().forward).toBe(0)
    fire(pick(root, '[data-drive="play"]'), 'pointerdown', 0, 0, 8)
    expect(played).toBe(1)
    hud.dispose()
  })
})

describe('touch driving mixes analog sprint with keyboard', () => {
  it('adds Studio rig throttle and turbo on top of keys', () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [40, 1, 40]
    const document = {
      version: 1 as const,
      name: 'Rig mix',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 1, 0]),
        presetVehicle('car', 's3', [0, 1.45, 0]),
      ],
    }
    const sim = new Simulation(document)
    for (let i = 0; i < 60; i++) sim.step(1 / 60)
    sim.startInVehicle('s3')
    const input = new GameInput()
    const mixed = input.read(sim, document, 1 / 60, {
      keys: new Set(['KeyW']),
      yaw: 0,
      driving: { forward: 0.4, right: 0.2, brake: true, sprint: true },
    })
    expect(mixed.forward).toBeCloseTo(1.4)
    expect(mixed.right).toBeGreaterThan(0)
    expect(mixed.brake).toBe(true)
    expect(mixed.sprint).toBe(true)
    const keysOnly = input.read(sim, document, 1 / 60, {
      keys: new Set(['KeyS']),
      yaw: 0,
      driving: { forward: 0, right: 0, brake: false },
    })
    expect(keysOnly.forward).toBe(-1)
    expect(keysOnly.sprint).toBe(false)
    sim.dispose()
  })
})

void dom
