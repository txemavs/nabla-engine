export {}
// randomUUID is only on https and localhost. The WSL address is plain http.
if (typeof crypto.randomUUID !== 'function') {
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
}
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
