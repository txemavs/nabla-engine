import { controlsHint, type InputContext } from '@nabla/engine/config/controls'
const previous = new WeakMap<HTMLElement, string>()
/** Refresh only after a context change; no per-frame DOM writes or duplicate key descriptions. */
export function showControlHints(element: HTMLElement | null, context: InputContext): void {
  if (!element) return
  const signature = `${context.mode}:${context.weapon}:${context.aiming}:${context.menu}`
  if (previous.get(element) === signature) return
  previous.set(element, signature)
  element.textContent = controlsHint(context)
}
