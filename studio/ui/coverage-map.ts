/** 2D coverage chart. Sea stays blue. Everything else is a translucent white patch. */
const TILE = 256
const MIN_Z = 2
const MAX_Z = 15
export type MapPin = { id: string; name: string; latitude: number; longitude: number }
export type MapBridge = {
  pins: () => MapPin[]
  movePin: (id: string, latitude: number, longitude: number) => void
  previewPin?: (id: string, latitude: number, longitude: number) => void
  moveView: (latitude: number, longitude: number) => void
  selectPin?: (id: string) => void
  glance?: (latitude: number, longitude: number) => void
  setDrone?: (on: boolean) => void
}
let bridge: MapBridge | undefined
export function bindCoverageMap(next: MapBridge) {
  bridge = next
}
type Cell = { z: number; x: number; y: number; surface?: string }
type Status = {
  cells?: Cell[]
  queue?: { queued?: number; running?: number }
  coverage?: { focus?: { latitude: number; longitude: number }; tiles?: number }
  latest?: { stamp?: number }
  disk?: { publishedBytes?: number }
}
type ImageEntry = { img: HTMLImageElement; ok: boolean; failed: boolean }

export function mountCoverageMap(host: HTMLElement) {
  host.replaceChildren()
  const bar = document.createElement('header')
  const zoomLabel = document.createElement('span')
  const summary = document.createElement('span')
  summary.className = 'coverage-summary'
  const follow = document.createElement('button')
  follow.type = 'button'
  follow.textContent = 'Seguir'
  follow.title = 'Centra el mapa en donde está la cámara'
  const note = document.createElement('p')
  const canvas = document.createElement('canvas')
  const drone = document.createElement('div')
  drone.className = 'drone'
  const picture = document.createElement('canvas')
  picture.width = 320
  picture.height = 180
  picture.setAttribute('aria-label', 'Vista del dron')
  const osd = document.createElement('div')
  osd.className = 'osd'
  const osdPlace = document.createElement('div')
  const osdAlt = document.createElement('div')
  osdAlt.className = 'osd-alt'
  osdAlt.textContent = '55 m'
  const crosshair = document.createElement('div')
  crosshair.className = 'crosshair'
  osd.append(osdPlace, osdAlt, crosshair)
  drone.append(picture, osd)
  bar.append(zoomLabel, summary, follow)
  host.append(bar, canvas, drone, note)
  const ctx = canvas.getContext('2d')!
  const images = new Map<string, ImageEntry>()
  let z = 4
  let cx = 0.5
  let cy = 0.45
  let cells: Cell[] = []
  let following = true
  let shown = false
  let placed = false
  let timer = 0
  let paintTimer = 0
  let hold: { kind: 'view' | 'object'; id: string; latitude: number; longitude: number } | null =
    null

  function wrapX(x: number, n: number) {
    return ((x % n) + n) % n
  }
  function mercatorY(latitude: number) {
    const lat = Math.max(-85, Math.min(85, latitude)) * (Math.PI / 180)
    return (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2
  }
  function loadImage(id: string, url: string) {
    let entry = images.get(id)
    if (entry) return entry
    const img = new Image()
    entry = { img, ok: false, failed: false }
    img.onload = () => {
      entry!.ok = true
      draw()
    }
    img.onerror = () => {
      entry!.failed = true
    }
    img.src = url
    images.set(id, entry)
    return entry
  }
  function paint(url: string, id: string, px: number, py: number) {
    const entry = loadImage(id, url)
    if (entry.ok) ctx.drawImage(entry.img, px, py, TILE, TILE)
    return entry.ok
  }
  function resize() {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, canvas.clientHeight || host.clientHeight - 52)
    canvas.width = width
    canvas.height = height
    draw()
  }
  function draw() {
    const n = 2 ** z
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const x0 = Math.floor(cx * n - canvas.width / 2 / TILE) - 1
    const y0 = Math.floor(cy * n - canvas.height / 2 / TILE) - 1
    const x1 = Math.ceil(cx * n + canvas.width / 2 / TILE) + 1
    const y1 = Math.ceil(cy * n + canvas.height / 2 / TILE) + 1
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue
      for (let x = x0; x <= x1; x++) {
        const wrapped = wrapX(x, n)
        const px = (x - cx * n) * TILE + canvas.width / 2
        const py = (y - cy * n) * TILE + canvas.height / 2
        const base =
          z <= 8
            ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${wrapped}.jpeg`
            : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${wrapped}`
        paint(base, `base/${z}/${wrapped}/${y}`, px, py)
      }
    }
    if (z >= 13) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= n) continue
        for (let x = x0; x <= x1; x++) {
          const px = (x - cx * n) * TILE + canvas.width / 2
          const py = (y - cy * n) * TILE + canvas.height / 2
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1)
        }
      }
    }
    for (const cell of cells) {
      const scale = 2 ** (z - cell.z)
      const px = (cell.x * scale - cx * n) * TILE + canvas.width / 2
      const py = (cell.y * scale - cy * n) * TILE + canvas.height / 2
      const size = Math.max(3, TILE * scale)
      if (px + size < 0 || py + size < 0 || px > canvas.width || py > canvas.height) continue
      ctx.fillStyle = cell.surface === 'sea' ? 'rgba(3,55,76,0.92)' : 'rgba(255,255,255,0.38)'
      ctx.fillRect(px, py, size, size)
    }
    ctx.font = '11px sans-serif'
    ctx.textBaseline = 'middle'
    for (const pin of markers()) {
      const at = project(pin.latitude, pin.longitude)
      ctx.fillStyle = '#f4f1ea'
      ctx.strokeStyle = '#1b1b1b'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(at.px, at.py, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#f4f1ea'
      ctx.fillText(pin.name, at.px + 9, at.py)
    }
    const gps = viewPoint()
    if (gps) {
      const at = project(gps.latitude, gps.longitude)
      ctx.fillStyle = '#ff3548'
      ctx.beginPath()
      ctx.arc(at.px, at.py, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    zoomLabel.textContent = `zoom ${z}`
    const aim =
      hold?.kind === 'object'
        ? { latitude: hold.latitude, longitude: hold.longitude }
        : {
            longitude: cx * 360 - 180,
            latitude: (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI,
          }
    if (hold?.kind === 'object') bridge?.previewPin?.(hold.id, aim.latitude, aim.longitude)
    bridge?.glance?.(aim.latitude, aim.longitude)
    osdPlace.textContent = `${aim.latitude.toFixed(5)}°  ${aim.longitude.toFixed(5)}°`
  }
  function readGps() {
    const place = viewPoint()
    if (!place) return null
    return { x: (place.longitude + 180) / 360, y: mercatorY(place.latitude) }
  }
  function viewPoint() {
    if (hold?.kind === 'view') return { latitude: hold.latitude, longitude: hold.longitude }
    const text = document.getElementById('gps-status')?.textContent ?? ''
    const match = text.match(/(-?\d+\.\d+)°,\s*(-?\d+\.\d+)°/)
    if (!match) return null
    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return { latitude, longitude }
  }
  function markers() {
    const pins = bridge?.pins() ?? []
    if (hold?.kind !== 'object') return pins
    return pins.map((pin) =>
      pin.id === hold!.id ? { ...pin, latitude: hold!.latitude, longitude: hold!.longitude } : pin,
    )
  }
  function project(latitude: number, longitude: number) {
    const n = 2 ** z
    const x = ((longitude + 180) / 360) * n
    const y = mercatorY(latitude) * n
    return {
      px: (x - cx * n) * TILE + canvas.width / 2,
      py: (y - cy * n) * TILE + canvas.height / 2,
    }
  }
  function latLonAt(clientX: number, clientY: number) {
    const box = canvas.getBoundingClientRect()
    const n = 2 ** z
    const fx = cx + (clientX - box.left - canvas.width / 2) / TILE / n
    const fy = cy + (clientY - box.top - canvas.height / 2) / TILE / n
    return {
      longitude: fx * 360 - 180,
      latitude: (Math.atan(Math.sinh(Math.PI * (1 - 2 * fy))) * 180) / Math.PI,
    }
  }
  function pick(clientX: number, clientY: number): 'view' | string | null {
    const box = canvas.getBoundingClientRect()
    const x = clientX - box.left
    const y = clientY - box.top
    let best: { id: 'view' | string; distance: number } | undefined
    const gps = viewPoint()
    if (gps) {
      const at = project(gps.latitude, gps.longitude)
      const distance = Math.hypot(x - at.px, y - at.py)
      if (distance <= 10) best = { id: 'view', distance }
    }
    for (const pin of markers()) {
      const at = project(pin.latitude, pin.longitude)
      const distance = Math.hypot(x - at.px, y - at.py)
      if (distance <= 12 && (!best || distance < best.distance)) best = { id: pin.id, distance }
    }
    return best?.id ?? null
  }
  function lookAt(latitude: number, longitude: number) {
    cx = (longitude + 180) / 360
    cy = mercatorY(latitude)
    draw()
  }
  function zoomAt(next: number, clientX: number, clientY: number) {
    next = Math.max(MIN_Z, Math.min(MAX_Z, next))
    if (next === z) return
    const box = canvas.getBoundingClientRect()
    const px = clientX - box.left
    const py = clientY - box.top
    const n = 2 ** z
    const wx = cx + (px - canvas.width / 2) / TILE / n
    const wy = cy + (py - canvas.height / 2) / TILE / n
    z = next
    const n2 = 2 ** z
    cx = wx - (px - canvas.width / 2) / TILE / n2
    cy = Math.max(0, Math.min(1, wy - (py - canvas.height / 2) / TILE / n2))
    draw()
  }
  function tileAt(event: PointerEvent) {
    const box = canvas.getBoundingClientRect()
    const n = 2 ** z
    const x = Math.floor(cx * n + (event.clientX - box.left - canvas.width / 2) / TILE)
    const y = Math.floor(cy * n + (event.clientY - box.top - canvas.height / 2) / TILE)
    if (y < 0 || y >= n) return null
    return `z/${z}/${wrapX(x, n)}/${y}`
  }
  async function refresh() {
    const next = await fetch('/world-cache/status.json')
      .then((response) => (response.ok ? (response.json() as Promise<Status>) : null))
      .catch(() => null)
    if (!next) return
    cells = next.cells ?? []
    const queued = (next.queue?.queued ?? 0) + (next.queue?.running ?? 0)
    const when = next.latest?.stamp
      ? new Date(next.latest.stamp * 1000).toLocaleString('es', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'nunca'
    const published = next.disk?.publishedBytes
    summary.textContent = `${next.coverage?.tiles ?? cells.length} celdas · cola ${queued} · última ${when}${
      published ? ` · ${(published / 2 ** 30).toFixed(1)} GiB` : ''
    }`
    if (!placed) {
      placed = true
      const place = next.coverage?.focus
      const gps = readGps()
      if (gps) {
        cx = gps.x
        cy = gps.y
      } else if (place) lookAt(place.latitude, place.longitude)
    } else if (following) {
      const gps = readGps()
      if (gps) {
        cx = gps.x
        cy = gps.y
      }
    }
    for (const cell of cells) {
      const id = `ours/${cell.z}/${cell.x}/${cell.y}`
      const entry = images.get(id)
      if (entry && !entry.ok) {
        entry.failed = false
        entry.img.src = `/world-cache/tiles/${cell.z}/${cell.x}/${cell.y}.jpg?t=${Date.now()}`
      }
    }
    draw()
  }
  function arm() {
    window.clearInterval(timer)
    window.clearInterval(paintTimer)
    if (!shown) return
    void refresh()
    timer = window.setInterval(() => void refresh(), 12000)
    paintTimer = window.setInterval(draw, 500)
  }
  follow.onclick = () => {
    following = true
    follow.classList.add('is-on')
    const parsed = readGps()
    if (parsed) {
      cx = parsed.x
      cy = parsed.y
      draw()
    }
  }
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      following = false
      follow.classList.remove('is-on')
      zoomAt(z + (event.deltaY > 0 ? -1 : 1), event.clientX, event.clientY)
    },
    { passive: false },
  )
  const asked = new Set<string>()
  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null
  canvas.addEventListener('pointerdown', (event) => {
    const hit = pick(event.clientX, event.clientY)
    drag = { x: event.clientX, y: event.clientY, cx, cy, moved: false }
    if (hit) {
      const at = latLonAt(event.clientX, event.clientY)
      hold = {
        kind: hit === 'view' ? 'view' : 'object',
        id: hit,
        latitude: at.latitude,
        longitude: at.longitude,
      }
      if (hit !== 'view') bridge?.selectPin?.(hit)
    }
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true
    if (hold && drag.moved) {
      const at = latLonAt(event.clientX, event.clientY)
      hold.latitude = at.latitude
      hold.longitude = at.longitude
      draw()
      return
    }
    if (!drag.moved) return
    const n = 2 ** z
    cx = drag.cx - (event.clientX - drag.x) / TILE / n
    cy = Math.max(0, Math.min(1, drag.cy - (event.clientY - drag.y) / TILE / n))
    draw()
  })
  canvas.addEventListener('pointerup', (event) => {
    const moved = drag?.moved
    const erase = event.altKey
    const carried = hold
    drag = null
    hold = null
    if (carried && moved) {
      if (carried.kind === 'view') bridge?.moveView(carried.latitude, carried.longitude)
      else bridge?.movePin(carried.id, carried.latitude, carried.longitude)
      draw()
      return
    }
    if (moved) {
      following = false
      follow.classList.remove('is-on')
      return
    }
    const tile = tileAt(event)
    if (!tile) return
    if (z < 13 && !erase) {
      zoomAt(z + 1, event.clientX, event.clientY)
      return
    }
    const known = cells.some((cell) => `z/${cell.z}/${cell.x}/${cell.y}` === tile)
    if (!erase && (known || asked.has(tile))) {
      note.textContent = known ? `${tile} ya está hecha.` : `${tile} ya está en cola.`
      return
    }
    note.textContent = erase ? `Borrando ${tile}…` : `Pidiendo ${tile}…`
    if (!erase) asked.add(tile)
    void fetch(erase ? '/world-cache/map/delete' : '/world-cache/map/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tile }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string
          removed?: string[]
          accepted?: number
        }
        if (!response.ok) {
          note.textContent =
            body.error || (erase ? 'Este servicio aún no borra.' : 'No se ha podido pedir.')
          return
        }
        if (erase) {
          const gone = new Set(body.removed ?? [])
          cells = cells.filter((cell) => !gone.has(`z/${cell.z}/${cell.x}/${cell.y}`))
          for (const key of gone) images.delete(`ours/${key.replace('z/', '')}`)
          note.textContent = gone.size
            ? `Fuera ${gone.size} celda${gone.size === 1 ? '' : 's'}.`
            : 'Ahí no había nada.'
        } else {
          note.textContent =
            body.accepted === 0
              ? `${tile} ya estaba hecha o la cola no la admite.`
              : `${tile} en cola.`
        }
        draw()
      })
      .catch(() => {
        note.textContent = 'Sin respuesta del servicio de teselas.'
      })
  })
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  note.textContent =
    'Mar en azul, el resto en blanco. Arrastra un objeto: conserva los metros sobre el suelo. El dron, abajo a la derecha, mira el centro.'
  follow.classList.add('is-on')
  return {
    setVisible(value: boolean) {
      shown = value
      bridge?.setDrone?.(value)
      arm()
      if (value) resize()
    },
    droneCanvas: picture,
    resize,
    dispose() {
      shown = false
      window.clearInterval(timer)
      window.clearInterval(paintTimer)
      observer.disconnect()
    },
  }
}
