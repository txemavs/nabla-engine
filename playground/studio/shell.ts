import { mountSettingsWindow } from './settings-window.js'
import { createApp, h } from 'vue'
import { ExternalContent, MenuBar, WorkspaceHost } from '@nabla/desktop'
import {
  createCommandRegistry,
  createWorkspace,
  type ContentFactory,
  type WorkspaceSnapshot,
} from '@nabla/desktop/core'
import type { StudioInputOwner } from './input-owner.js'
import '@nabla/desktop/style.css'
import './shell.css'

export interface StudioHost {
  refresh: () => void
  undo: () => void
  redo: () => void
  togglePlay: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  canPlay: () => boolean
  isPlaying: () => boolean
  input: StudioInputOwner
  reportError: (error: unknown) => void
}
const layoutKey = 'nabla.studio.layout.v2'
export function mountStudio(host: StudioHost): void {
  document.getElementById('welcome')!.hidden = true
  mountSettingsWindow(host.input)
  const app = document.getElementById('app')!
  const viewport = document.getElementById('viewport')!
  const viewportPanel = document.createElement('section')
  viewportPanel.id = 'studio-viewport-panel'
  app.append(viewportPanel)
  viewportPanel.append(app.querySelector('.toolbar')!, viewport)
  const tools = document.createElement('nav')
  tools.className = 'studio-viewport-tools'
  tools.setAttribute('aria-label', 'Herramientas 3D')
  for (const id of ['translate', 'rotate', 'focus']) tools.append(document.getElementById(id)!)
  viewport.append(tools)
  document.getElementById('studio-object-mode')!.hidden = false
  const locations = document.createElement('div')
  locations.id = 'studio-locations'
  document.getElementById('tree')!.before(locations)
  const workspace = createWorkspace()
  const registry = createCommandRegistry()
  registry.register({ id: 'undo', label: 'Deshacer', enabled: host.canUndo, execute: host.undo })
  registry.register({ id: 'redo', label: 'Rehacer', enabled: host.canRedo, execute: host.redo })
  registry.register({
    id: 'play',
    label: 'Iniciar / detener prueba',
    enabled: host.canPlay,
    checked: host.isPlaying,
    execute: host.togglePlay,
  })
  const definitions = [
    { id: 'world', title: 'Vista 3D', selector: '#studio-viewport-panel' },
    { id: 'scene', title: 'Escena', selector: '.outliner' },
    { id: 'properties', title: 'Propiedades', selector: '.inspector' },
  ]
  const factories = new Map<string, ContentFactory>()
  for (const panel of definitions) {
    const element = app.querySelector<HTMLElement>(panel.selector)!
    workspace.register({ id: panel.id, title: panel.title })
    factories.set(panel.id, (container) => {
      container.append(element)
      return {
        setActive: panel.id === 'world' ? (value) => host.input.setActive(value) : undefined,
        setVisible: panel.id === 'world' ? (value) => host.input.setVisible(value) : undefined,
        // The existing application owns this DOM, its renderer and its listeners.
        dispose: () => {
          app.append(element)
        },
      }
    })
    registry.register({
      id: panel.id,
      label: panel.title,
      execute: () => {
        workspace.open(panel.id)
        workspace.activate(panel.id)
      },
    })
  }
  const defaults: WorkspaceSnapshot = {
    version: 1,
    active: 'world',
    floating: [],
    root: {
      kind: 'split',
      id: 'main',
      axis: 'horizontal',
      ratio: 0.76,
      first: { kind: 'tabs', id: 'world-tabs', tabs: ['world'], active: 'world' },
      second: {
        kind: 'split',
        id: 'sidebar',
        axis: 'vertical',
        ratio: 0.38,
        first: { kind: 'tabs', id: 'scene-tabs', tabs: ['scene'], active: 'scene' },
        second: { kind: 'tabs', id: 'properties-tabs', tabs: ['properties'], active: 'properties' },
      },
    },
  }
  workspace.restore(defaults)
  try {
    const saved = localStorage.getItem(layoutKey)
    if (saved) workspace.restore(JSON.parse(saved))
  } catch {
    /* Invalid or unavailable storage falls back to the default workspace. */
  }
  workspace.subscribe(() => {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(workspace.snapshot()))
    } catch {
      /* Restricted storage must not prevent editing. */
    }
  })
  registry.register({
    id: 'reset-layout',
    label: 'Restablecer distribución',
    execute: () => workspace.restore(defaults),
  })
  const menuRoot = document.createElement('div')
  app.querySelector('header')!.append(menuRoot)
  const root = document.createElement('section')
  root.className = 'studio-workspace'
  root.setAttribute('aria-label', 'Espacio de trabajo de Studio')
  app.append(root)
  app.classList.add('studio-desktop')
  const interaction = {
    onInteractionStart: () => {
      registry.notify()
      host.input.beginInteraction()
    },
    onInteractionEnd: () => host.input.endInteraction(),
    onError: host.reportError,
  }
  createApp({
    render: () =>
      h(MenuBar, {
        registry,
        menus: [
          { id: 'edit', label: 'Editar', items: [{ command: 'undo' }, { command: 'redo' }] },
          { id: 'run', label: 'Ejecutar', items: [{ command: 'play' }] },
          {
            id: 'workspace',
            label: 'Ventanas',
            items: [
              ...definitions.map((p) => ({ command: p.id })),
              { separator: true },
              { command: 'reset-layout' },
            ],
          },
        ],
        ...interaction,
      }),
  }).mount(menuRoot)
  createApp({
    render: () =>
      h(
        WorkspaceHost,
        {
          workspace,
          ...interaction,
          labels: {
            float: 'Flotar panel',
            dock: 'Acoplar panel',
            close: 'Cerrar panel',
            resize: 'Redimensionar',
            move: 'Mover panel',
            left: 'Dividir a la izquierda',
            right: 'Dividir a la derecha',
            top: 'Dividir arriba',
            bottom: 'Dividir abajo',
            group: 'Paneles',
            modified: 'Modificado',
            moveTab: 'Mover pestaña',
          },
        },
        {
          default: ({
            panel,
            visible,
            active,
          }: {
            panel: { id: string }
            visible: boolean
            active: boolean
          }) =>
            h(ExternalContent, {
              mount: factories.get(panel.id)!,
              visible,
              active,
              onError: host.reportError,
            }),
        },
      ),
  }).mount(root)
  // Desktop currently reserves 72px for tabs + actions. Studio overlays actions
  // on the 36px tab strip; keep its 1px border and reclaim the unused row.
  const compactPanels = () => {
    for (const panel of root.querySelectorAll<HTMLElement>('.nd-panel-content, .nd-drop-grid')) {
      for (const dimension of ['top', 'height'] as const) {
        const key = `--studio-panel-${dimension}`
        if (panel.style.getPropertyValue(key) !== panel.style[dimension])
          panel.style.setProperty(key, panel.style[dimension])
      }
    }
  }
  new MutationObserver(compactPanels).observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
  })
  compactPanels()
  host.refresh()
}
