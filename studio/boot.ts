import { withNablaIndicator, type NablaIndicatorState } from '../src/ui/nabla-indicator.js'

const status = document.getElementById('boot-status')!
const message = document.getElementById('boot-message')!

function setBootMessage(text: string, state: NablaIndicatorState = 'normal'): void {
  message.innerHTML = withNablaIndicator(text, state)
}

// Let the static loading UI paint before evaluating the engine and its dependencies.
await new Promise<void>((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
)
try {
  setBootMessage('Abriendo el proyecto y preparando el editor…', 'reconnecting')
  await import('./main.js')
  status.hidden = true
} catch (error) {
  setBootMessage('No se pudo abrir Studio. Recarga para volver a intentarlo.', 'error')
  document.getElementById('boot-retry')!.hidden = false
  console.error(error)
}
