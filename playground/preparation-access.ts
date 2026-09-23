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
        status.replaceChildren()
        const activate = document.createElement('button')
        activate.textContent = 'Activar generación GLB…'
        activate.title = 'Sin sesión privada solo se descargan baldosas ya preparadas.'
        activate.onclick = () => {
          const dialog = document.createElement('dialog')
          const form = document.createElement('form')
          const label = document.createElement('label')
          label.textContent = 'Clave privada de generación del servidor'
          const input = document.createElement('input')
          input.type = 'password'
          input.autocomplete = 'off'
          input.required = true
          label.append(input)
          const submit = document.createElement('button')
          submit.textContent = 'Activar'
          const cancel = document.createElement('button')
          cancel.type = 'button'
          cancel.textContent = 'Cancelar'
          cancel.onclick = () => dialog.close()
          const message = document.createElement('p')
          form.append(label, submit, cancel, message)
          form.onsubmit = async (event) => {
            event.preventDefault()
            submit.disabled = true
            try {
              const response = await fetch(`${base}/session`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { Authorization: `Bearer ${input.value.trim()}` },
              })
              input.value = ''
              if (!response.ok) throw Error('Clave incorrecta o acceso no disponible.')
              dialog.close()
              void refresh()
            } catch (error) {
              message.textContent = String(error)
            } finally {
              submit.disabled = false
            }
          }
          dialog.append(form)
          dialog.onclose = () => dialog.remove()
          document.body.append(dialog)
          dialog.showModal()
          input.focus()
        }
        status.append('Generación desactivada · ', activate)
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
