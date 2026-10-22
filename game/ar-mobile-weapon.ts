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
  launcher.className = 'nabla-ar-bar nabla-ar-bar--tl'
  const bar = document.createElement('div')
  bar.className = 'nabla-ar-bar nabla-ar-bar--br'
  const button = (label: string, symbol: string, run: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.title = label
    b.setAttribute('aria-label', label)
    b.textContent = symbol
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
  sight.className = 'nabla-ar-sight'
  host.append(launcher, bar, sight)
  window.addEventListener('blur', () => actions.fire(false))
}
