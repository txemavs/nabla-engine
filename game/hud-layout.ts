import { addCornerButton, cornerGroup, insertOrdered } from '../src/runtime/corner-buttons.js'

/** Arrange existing controls in the shared game corners; keep their actions and popovers intact. */
export function mountGameToolbar(clock: HTMLButtonElement, doc: Document = document): () => void {
  const toolbar = doc.querySelector<HTMLElement>('.game-toolbar')
  addCornerButton('tr', clock, 60, doc)
  if (!toolbar) return () => {}
  const moved: { element: HTMLElement; parent: HTMLElement; next: ChildNode | null }[] = []
  const remember = (element: HTMLElement) =>
    moved.push({ element, parent: element.parentElement!, next: element.nextSibling })
  const top = (element: HTMLElement, order: number) => {
    remember(element)
    addCornerButton('tr', element, order, doc)
  }
  for (const popover of toolbar.querySelectorAll<HTMLElement>(':scope > .nabla-btn-popover'))
    top(popover, Number(popover.dataset.order) === 31 ? 40 : 30)
  for (const button of toolbar.querySelectorAll<HTMLElement>('button[data-toolbar-label]')) {
    if (button.dataset.toolbarLabel === 'ADD') top(button, 10)
    if (button.dataset.toolbarLabel === 'CAM') {
      button.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>CAM</span>'
      top(button, 20)
    }
  }
  for (const [selector, order] of [
    ['.game-toolbar-navigation', 10],
    ['.weapon-controls', 20],
  ] as const) {
    const controls = toolbar.querySelector<HTMLElement>(selector)
    if (!controls) continue
    remember(controls)
    controls.classList.remove('nabla-btn-group--column')
    insertOrdered(cornerGroup('br', doc), controls, order)
  }
  const wasHidden = toolbar.hidden
  toolbar.hidden = true
  return () => {
    for (const { element, parent, next } of moved.reverse())
      parent.insertBefore(element, next?.parentNode === parent ? next : null)
    toolbar.hidden = wasHidden
  }
}
