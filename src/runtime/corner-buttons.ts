/**
 * The one way to put buttons in a screen corner: each corner has a single `.nabla-btn-group`
 * (`#nabla-corner-<corner>`), and every child is a `.nabla-btn` (or a `.nabla-btn-popover`
 * holding one button and its dropdown panel). Children are kept in DOM order by their explicit
 * `order` (stored in `data-order`), so the row never depends on CSS `order` or insertion timing.
 */
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

/** Insert `child` into `parent` before the first sibling with a larger `data-order`. */
export function insertOrdered(parent: HTMLElement, child: HTMLElement, order: number): void {
  child.dataset.order = String(order)
  const next = [...parent.children].find(
    (other) =>
      other !== child &&
      other instanceof HTMLElement &&
      Number(other.dataset.order ?? Infinity) > order,
  )
  if (child.parentElement === parent && child.nextElementSibling === (next ?? null)) return
  parent.insertBefore(child, next ?? null)
}

/** The corner's single button group, created on first use. */
export function cornerGroup(corner: Corner, doc: Document = document): HTMLElement {
  const id = `nabla-corner-${corner}`
  let group = doc.getElementById(id)
  if (!group) {
    group = doc.createElement('div')
    group.id = id
    group.className = `nabla-btn-group nabla-corner nabla-corner--${corner}`
    group.setAttribute('role', 'group')
    doc.body.append(group)
  }
  return group
}

/**
 * Put `element` (a button, or a `.nabla-btn-popover`) in `corner` at `order`. Buttons get the
 * `.nabla-btn` class and lose any corner anchor of their own. Idempotent: calling again with the
 * same order does not move the element.
 */
export function addCornerButton(
  corner: Corner,
  element: HTMLElement,
  order: number,
  doc: Document = document,
): HTMLElement {
  const group = cornerGroup(corner, doc)
  element.classList.remove(
    'nabla-corner',
    'nabla-corner--tl',
    'nabla-corner--tr',
    'nabla-corner--bl',
    'nabla-corner--br',
  )
  if (!element.classList.contains('nabla-btn-popover')) element.classList.add('nabla-btn')
  insertOrdered(group, element, order)
  return group
}
