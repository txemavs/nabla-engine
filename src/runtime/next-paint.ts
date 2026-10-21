/**
 * Yield so the browser can paint before more synchronous work, without depending on the window's
 * requestAnimationFrame alone: during an immersive WebXR session the headset browsers (Quest)
 * stop or heavily throttle window rAF, so loaders that waited on it stalled for tens of seconds
 * (drawing a weapon or boarding a vehicle in VR). Whichever comes first wins: rAF + a task, or a
 * short timeout.
 */
export function nextPaint(fallbackMs = 34): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    if (typeof document !== 'undefined' && document.hidden) {
      setTimeout(finish, 0)
      return
    }
    setTimeout(finish, fallbackMs)
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => setTimeout(finish, 0))
  })
}
