/** Mobile object launcher above, contextual actions below; firearm mechanics remain in Engine. */
export function mobileWeaponUI(
  host: HTMLElement,
  actions: {
    equip: () => void
    reload: () => void
    fire: (down: boolean) => void
    move: (x: number, y: number) => void
  },
) {
  const launcher = document.createElement('div')
  launcher.style.cssText =
    'position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));display:flex;gap:8px;pointer-events:auto'
  const bar = document.createElement('div')
  bar.style.cssText =
    'position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));display:flex;flex-direction:row;justify-content:flex-end;gap:8px;pointer-events:auto'
  const button = (label: string, symbol: string, run: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = label
    b.setAttribute('aria-label', label)
    b.textContent = symbol
    b.style.cssText =
      'width:56px;height:56px;font-size:28px;background:#252525;color:white;border:1px solid #555;border-radius:2px;touch-action:none'
    b.onclick = run
    bar.append(b)
    return b
  }
  launcher.append(button('Pistola', '🔫', actions.equip))
  const fire = button('Disparar', '◎', () => {})
  fire.onpointerdown = (e) => {
    e.preventDefault()
    fire.setPointerCapture(e.pointerId)
    actions.fire(true)
  }
  fire.onpointerup = fire.onpointercancel = fire.onlostpointercapture = () => actions.fire(false)
  button('Recargar', '↻', actions.reload)
  const move = button('Arrastrar para colocar la pistola', '✥', () => {})
  let pointer: number | null = null,
    x = 0,
    y = 0
  move.onpointerdown = (e) => {
    pointer = e.pointerId
    x = e.clientX
    y = e.clientY
    move.setPointerCapture(pointer)
  }
  move.onpointermove = (e) => {
    if (e.pointerId !== pointer) return
    actions.move((e.clientX - x) / innerWidth, -(e.clientY - y) / innerHeight)
    x = e.clientX
    y = e.clientY
  }
  move.onpointerup =
    move.onpointercancel =
    move.onlostpointercapture =
      () => {
        pointer = null
      }
  const sight = document.createElement('div')
  sight.textContent = '·'
  sight.style.cssText =
    'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:32px;color:white;text-shadow:0 0 3px black;pointer-events:none'
  host.append(launcher, bar, sight)
  window.addEventListener('blur', () => actions.fire(false))
}
