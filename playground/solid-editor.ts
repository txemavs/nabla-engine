import * as THREE from 'three'
import { extrudeFace, removeVertex, triangles, type SolidGeometry } from '../src/solid.js'
import type { Entity, Vec3Tuple } from '../src/scene.js'

/** Host adapter: every completed operation is one SceneEditor transaction. */
export class SolidEditor {
  active = false
  private id = ''
  private mode: 'point' | 'line' | 'face' = 'point'
  private chain: number[] = []
  private vertex = 0
  private face = 0
  private plane = 'xz'
  private level = 0
  private overlay = new THREE.Group()
  constructor(
    private commit: (geometry: SolidGeometry) => void,
    private refresh: () => void,
    private report: (message: string) => void,
  ) {}
  private run(fn: () => void): void {
    try {
      fn()
    } catch (e) {
      this.report(e instanceof Error ? e.message : String(e))
    }
  }
  private clear(): void {
    this.overlay.removeFromParent()
    this.overlay.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose()
        o.material.dispose()
      }
    })
    this.overlay = new THREE.Group()
  }
  close(): void {
    this.active = false
    this.chain = []
    this.clear()
  }
  mount(entity: Entity, object: THREE.Group, props: HTMLElement, playing: boolean): void {
    this.clear()
    if (entity.id !== this.id || playing || !entity.geometry) {
      this.active = false
      this.chain = []
      this.id = entity.id
    }
    if (!entity.geometry || playing) return
    const g = entity.geometry
    this.chain = this.chain.filter((i) => i < g.vertices.length)
    this.vertex = Math.min(this.vertex, Math.max(0, g.vertices.length - 1))
    this.face = Math.min(this.face, Math.max(0, g.faces.length - 1))
    const panel = document.createElement('section')
    panel.className = 'solid-tools'
    panel.innerHTML = `<button id="edit-solid">${this.active ? 'Terminar geometría' : 'Editar geometría'}</button><p>${g.vertices.length} puntos · ${g.edges.length} líneas · ${g.faces.length} caras</p>`
    props.append(panel)
    panel.querySelector<HTMLButtonElement>('#edit-solid')!.onclick = () => {
      this.active = !this.active
      this.chain = []
      this.refresh()
    }
    if (!this.active) return
    panel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="property-actions"><button data-mode="point">Puntos</button><button data-mode="line">Líneas</button><button data-mode="face">Planos</button></div>
      <p>Clic para colocar puntos o elegir vértices. Líneas: dos puntos. Planos: perímetro en orden y Crear cara. Arrastra para orbitar.</p>
      <button id="solid-clear">Vaciar geometría</button>
      <label class="field-label">Plano de dibujo</label><select id="solid-plane"><option value="xz">Suelo · XZ</option><option value="xy">Frontal · XY</option><option value="yz">Lateral · YZ</option></select>
      <label class="field-label">Altura / distancia local · m</label><input id="solid-level" type="number" step="0.25" value="${this.level}">
      <p>Ajuste a rejilla de 0,25 m · ${this.chain.length} puntos en el trazo</p>
      <div class="property-actions"><button id="solid-face">Crear cara</button><button id="solid-cancel">Cancelar trazo</button></div>
      <label class="field-label">Punto</label><select id="solid-vertex">${g.vertices.map((_, i) => `<option value="${i}">${i + 1}</option>`).join('')}</select>
      <div class="axis-row">${(g.vertices[this.vertex] ?? [0, 0, 0]).map((v, i) => `<label>${'XYZ'[i]}<input data-point-axis="${i}" aria-label="Punto ${'XYZ'[i]}" type="number" step="0.25" value="${v}"></label>`).join('')}</div>
      <button id="solid-delete-point">Borrar punto y sus caras</button>
      <label class="field-label">Cara</label><select id="solid-selected-face">${g.faces.map((_, i) => `<option value="${i}">Cara ${i + 1}</option>`).join('')}</select>
      <label class="field-label">Extrusión · m</label><input id="solid-distance" type="number" step="0.25" value="1">
      <div class="property-actions"><button id="solid-extrude">Extruir cara</button><button id="solid-delete-face">Borrar cara</button></div>
      <label class="field-label">Línea</label><select id="solid-edge">${g.edges.map((e, i) => `<option value="${i}">${e[0] + 1} → ${e[1] + 1}</option>`).join('')}</select><button id="solid-delete-edge">Borrar línea</button>`,
    )
    const el = <T extends HTMLElement = HTMLInputElement>(id: string) =>
      panel.querySelector<T>('#' + id)!
    panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === this.mode)
      b.onclick = () => {
        this.mode = b.dataset.mode as typeof this.mode
        this.chain = []
        this.refresh()
      }
    })
    el<HTMLSelectElement>('solid-plane').value = this.plane
    el('solid-plane').onchange = () => {
      this.plane = el<HTMLSelectElement>('solid-plane').value
      this.refresh()
    }
    el('solid-level').onchange = () => {
      const n = el<HTMLInputElement>('solid-level').valueAsNumber
      if (Number.isFinite(n)) this.level = n
      this.refresh()
    }
    el('solid-clear').onclick = () =>
      this.run(() => {
        this.chain = []
        this.commit({ vertices: [], edges: [], faces: [] })
      })
    el('solid-cancel').onclick = () => {
      this.chain = []
      this.refresh()
    }
    el('solid-face').onclick = () =>
      this.run(() => {
        if (this.chain.length < 3) throw new Error('Elige al menos tres puntos del perímetro')
        const next = structuredClone(g)
        next.faces.push([...this.chain])
        this.commit(next)
        this.chain = []
        this.refresh()
      })
    el<HTMLButtonElement>('solid-face').disabled = this.mode !== 'face' || this.chain.length < 3
    el<HTMLSelectElement>('solid-vertex').value = String(this.vertex)
    el('solid-vertex').onchange = () => {
      this.vertex = Number(el<HTMLSelectElement>('solid-vertex').value)
      this.refresh()
    }
    panel.querySelectorAll<HTMLInputElement>('[data-point-axis]').forEach((input) => {
      input.disabled = !g.vertices.length
      input.onchange = () =>
        this.run(() => {
          const next = structuredClone(g)
          next.vertices[this.vertex][Number(input.dataset.pointAxis)] = input.valueAsNumber
          // Moving a corner can bend a polygon. Keep its surface as planar triangles.
          next.faces = next.faces.flatMap((f) =>
            f.includes(this.vertex) ? triangles({ ...g, faces: [f] }) : [f],
          )
          this.commit(next)
        })
    })
    el('solid-delete-point').onclick = () =>
      this.run(() => {
        this.chain = []
        this.commit(removeVertex(g, this.vertex))
      })
    el<HTMLSelectElement>('solid-selected-face').value = String(this.face)
    el('solid-selected-face').onchange = () => {
      this.face = Number(el<HTMLSelectElement>('solid-selected-face').value)
      this.refresh()
    }
    el('solid-extrude').onclick = () =>
      this.run(() =>
        this.commit(
          extrudeFace(g, this.face, el<HTMLInputElement>('solid-distance').valueAsNumber),
        ),
      )
    el('solid-delete-face').onclick = () =>
      this.run(() => {
        const next = structuredClone(g)
        next.faces.splice(this.face, 1)
        this.commit(next)
      })
    el('solid-delete-edge').onclick = () =>
      this.run(() => {
        const next = structuredClone(g)
        next.edges.splice(Number(el<HTMLSelectElement>('solid-edge').value), 1)
        this.commit(next)
      })
    for (const id of ['solid-extrude', 'solid-delete-face'])
      el<HTMLButtonElement>(id).disabled = !g.faces.length
    el<HTMLButtonElement>('solid-delete-edge').disabled = !g.edges.length
    el<HTMLButtonElement>('solid-delete-point').disabled = !g.vertices.length
    const lineIndices = [
      ...g.edges,
      ...g.faces.flatMap((f) => f.map((v, i) => [v, f[(i + 1) % f.length]])),
    ]
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(
        lineIndices.flatMap((e) => e.map((i) => new THREE.Vector3(...g.vertices[i]))),
      ),
      new THREE.LineBasicMaterial({ color: 0x82baff, depthTest: false }),
    )
    lines.renderOrder = 20
    this.overlay.add(lines)
    g.vertices.forEach((p, i) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({
          color: this.chain.includes(i) ? 0xffcf70 : i === this.vertex ? 0xffffff : 0x529dff,
          depthTest: false,
        }),
      )
      dot.position.fromArray(p)
      dot.renderOrder = 21
      this.overlay.add(dot)
    })
    if (g.faces[this.face]) {
      const f = g.faces[this.face],
        positions = f
          .slice(1, -1)
          .flatMap((v, i) => [f[0], v, f[i + 2]].flatMap((j) => g.vertices[j]))
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      const highlight = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffcf70,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      )
      this.overlay.add(highlight)
    }
    const grid = new THREE.GridHelper(20, 80, 0x5688bb, 0x34485b)
    if (this.plane === 'xy') {
      grid.rotation.x = Math.PI / 2
      grid.position.z = this.level
    } else if (this.plane === 'yz') {
      grid.rotation.z = Math.PI / 2
      grid.position.x = this.level
    } else grid.position.y = this.level
    this.overlay.add(grid)
    object.add(this.overlay)
  }
  click(ray: THREE.Raycaster, entity: Entity, object: THREE.Group): void {
    if (!this.active || !entity.geometry) return
    this.run(() => {
      const g = structuredClone(entity.geometry!)
      object.updateWorldMatrix(true, false)
      const local = ray.ray.clone().applyMatrix4(object.matrixWorld.clone().invert())
      let nearest = -1,
        distance = 0.22
      g.vertices.forEach((v, i) => {
        const d = local.distanceToPoint(new THREE.Vector3(...v))
        if (d < distance) {
          nearest = i
          distance = d
        }
      })
      if (nearest < 0) {
        const normal =
          this.plane === 'xz'
            ? new THREE.Vector3(0, 1, 0)
            : this.plane === 'xy'
              ? new THREE.Vector3(0, 0, 1)
              : new THREE.Vector3(1, 0, 0)
        const p = local.intersectPlane(new THREE.Plane(normal, -this.level), new THREE.Vector3())
        if (!p) throw new Error('Orienta la cámara hacia el plano de dibujo')
        p.set(...(p.toArray().map((n) => Math.round(n * 4) / 4) as Vec3Tuple))
        nearest = g.vertices.findIndex((v) => p.distanceTo(new THREE.Vector3(...v)) < 0.01)
        if (nearest < 0) {
          nearest = g.vertices.length
          g.vertices.push(p.toArray())
        }
      }
      this.vertex = nearest
      if (this.mode === 'line') {
        if (this.chain.length && this.chain[0] !== nearest) {
          const a = this.chain[0]
          if (!g.edges.some((e) => e.includes(a) && e.includes(nearest))) g.edges.push([a, nearest])
          this.chain = []
        } else this.chain = [nearest]
      } else if (this.mode === 'face' && !this.chain.includes(nearest)) this.chain.push(nearest)
      this.commit(g)
      this.refresh()
    })
  }
}
