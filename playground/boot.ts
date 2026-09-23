export {}
const status = document.getElementById('boot-status')!
const message = document.getElementById('boot-message')!
// Let the static loading UI paint before evaluating the engine and its dependencies.
await new Promise<void>((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
)
try {
  message.textContent = 'Abriendo el proyecto y preparando el editor…'
  await import('./main.js')
  status.hidden = true
} catch (error) {
  message.textContent = 'No se pudo abrir Studio. Recarga para volver a intentarlo.'
  document.getElementById('boot-retry')!.hidden = false
  console.error(error)
}
