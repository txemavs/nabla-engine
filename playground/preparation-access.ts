/** Owner activation secret arrives only in the URL fragment, never in the build. */
export async function activatePreparation(): Promise<void> {
  const base = import.meta.env.VITE_WORLD_PREPARE_API
  const params = new URLSearchParams(location.hash.slice(1)),
    token = params.get('prepare')
  if (token) {
    history.replaceState(null, '', location.pathname + location.search)
    if (!base) return
    try {
      const response = await fetch(`${base}/session`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'same-origin',
      })
      if (response.ok) location.reload()
      else alert('No se pudo activar la preparación de zonas. Comprueba el enlace privado.')
    } catch {
      alert('No se pudo conectar con el servidor de preparación.')
    }
    return
  }
  if (!base) return
  const status = document.createElement('span')
  status.id = 'prepare-status'
  status.setAttribute('role', 'status')
  status.title =
    'Preparación privada de zonas del recorrido. Los datos y mallas se reutilizan en visitas posteriores.'
  document.querySelector('footer')?.append(status)
  async function refresh(): Promise<void> {
    try {
      const response = await fetch(`${base}/status`, {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(5000),
      })
      if (response.status === 401) {
        status.remove()
        return
      }
      if (!response.ok) throw Error()
      const counts = (await response.json()) as Record<string, number>
      status.textContent = `Servidor · ${counts.ready ?? 0} preparadas · ${(counts.queued ?? 0) + (counts.running ?? 0)} pendientes${counts.failed ? ` · ${counts.failed} fallidas` : ''}`
    } catch {
      status.textContent = 'Preparación · servidor pendiente'
    }
    setTimeout(() => {
      void refresh()
    }, 15000)
  }
  await refresh()
}
