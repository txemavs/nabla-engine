/** Pointer coordinates in a touch rig's local axes, including clockwise mobile overlays. */
export function touchCoordinates(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  element: HTMLElement,
) {
  const rect = element.getBoundingClientRect()
  const x = event.clientX - rect.left - rect.width / 2
  const y = event.clientY - rect.top - rect.height / 2
  return element.closest('[data-touch-rotation="90"]')
    ? { x: y, y: -x, width: rect.height, height: rect.width }
    : { x, y, width: rect.width, height: rect.height }
}
