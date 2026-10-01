import { createApp, h, ref } from 'vue'
import {
  ExternalContent,
  MenuBar,
  CommandToolbar,
  WorkspaceHost,
  DesktopDialog,
  SidebarTabs,
} from '@nabla/desktop'
import {
  createWorkspace,
  type ContentFactory,
  type LayoutNode,
  type WorkspaceSnapshot,
} from '@nabla/desktop/core'
import type { StudioInputOwner } from './input-owner.js'
import {
  commands,
  preferencesOpen,
  helpOpen,
  cursorTool,
  inspectCapability,
  transformSelection,
  objectMode,
  log,
} from './ui/state.js'
import { preparePanels } from './ui/panels.js'
import { mainMenus, viewMenus, toolCommands } from './ui/menus.js'
import Inspector from './ui/Inspector.vue'
import ScenePanel from './ui/ScenePanel.vue'
import InformationPanel from './ui/InformationPanel.vue'
import PreferencesWindow from './ui/PreferencesWindow.vue'
import CapabilityWindow from './ui/CapabilityWindow.vue'
import ContentSections from './ui/ContentSections.vue'
import HostContent from './ui/HostContent.vue'
import { mountCoverageMap } from './ui/coverage-map.js'
import '@nabla/desktop/style.css'
import './shell.css'
import './ui/studio.css'
export interface StudioHost {
  refresh: () => void
  undo: () => void
  redo: () => void
  togglePlay: () => void | Promise<void>
  canUndo: () => boolean
  canRedo: () => boolean
  canPlay: () => boolean
  isPlaying: () => boolean
  input: StudioInputOwner
  reportError: (error: unknown) => void
}
function tabGroup(node: LayoutNode | null, panelId: string): string | null {
  if (!node) return null
  if (node.kind === 'tabs') return node.tabs.includes(panelId) ? node.id : null
  return tabGroup(node.first, panelId) ?? tabGroup(node.second, panelId)
}
function layoutHas(snapshot: WorkspaceSnapshot, panelId: string) {
  return (
    !!tabGroup(snapshot.root, panelId) ||
    snapshot.floating.some((group) => group.group.tabs.includes(panelId))
  )
}
export function mountStudio(host: StudioHost): void {
  const app = document.getElementById('app')!,
    viewport = document.getElementById('viewport')!
  document.getElementById('welcome')!.hidden = true
  const contents = preparePanels()
  const interactions = {
    onInteractionStart: () => {
      commands.notify()
      host.input.beginInteraction()
    },
    onInteractionEnd: () => host.input.endInteraction(),
    onError: host.reportError,
  }
  const register = (
    id: string,
    label: string,
    run: () => void | Promise<void>,
    enabled?: () => boolean,
  ) => {
    // Desktop supplies a command context. Host actions take no arguments; passing
    // that object to togglePlay would accidentally enable its startFlight option.
    const execute = () => run()
    if (commands.get(id)) {
      Object.assign(commands.get(id)!, { label, execute, enabled })
      return
    }
    commands.register({ id, label, execute, enabled })
  }
  register('undo', 'Deshacer', host.undo, host.canUndo)
  register('redo', 'Rehacer', host.redo, host.canRedo)
  register('play', 'Iniciar / detener prueba', host.togglePlay, host.canPlay)
  commands.get('play')!.checked = host.isPlaying
  register('preferences', 'Preferencias…', () => {
    preferencesOpen.value = true
    window.dispatchEvent(new Event('studio-preferences-open'))
  })
  register('help-controls', 'Controles', () => {
    helpOpen.value = true
  })
  register(
    'capability',
    'Editar capacidad…',
    () => inspectCapability.value(),
    () => !host.isPlaying(),
  )
  register(
    'exact-transform',
    'Transformar…',
    () => transformSelection.value(),
    () => !host.isPlaying(),
  )
  register(
    'cursor-select',
    'Cursor',
    () => {
      cursorTool.value = true
      host.refresh()
    },
    () => !host.isPlaying(),
  )
  register(
    'select',
    'Seleccionar',
    () => {
      cursorTool.value = false
      host.refresh()
    },
    () => !host.isPlaying(),
  )
  commands.get('cursor-select')!.checked = () => cursorTool.value
  const mode = (value: string) => {
    const input = document.getElementById('studio-object-mode') as HTMLSelectElement
    if (input.disabled) return
    input.value = value
    input.dispatchEvent(new Event('change'))
  }
  register(
    'mode-object',
    'Objeto',
    () => mode('object'),
    () => !host.isPlaying(),
  )
  register(
    'mode-edit',
    'Edición',
    () => mode('edit'),
    () =>
      !(document.querySelector('#studio-object-mode option[value=edit]') as HTMLOptionElement)
        ?.disabled && !host.isPlaying(),
  )
  commands.get('mode-object')!.checked = () => objectMode.value === 'object'
  commands.get('mode-edit')!.checked = () => objectMode.value === 'edit'
  for (const [id, icon] of Object.entries({
    'cursor-select': 'cursor',
    'cursor-selection': 'target',
    'cursor-view': 'cursor',
    'selection-cursor': 'toCursor',
    'origin-cursor': 'origin',
    select: 'select',
    duplicate: 'copy',
    delete: 'trash',
    translate: 'move',
    rotate: 'rotate',
    play: 'play',
    photo: 'camera',
    undo: 'undo',
    redo: 'redo',
  })) {
    if (commands.get(id)) commands.get(id)!.icon = icon
  }
  for (const id of ['cursor-selection', 'cursor-view', 'selection-cursor', 'origin-cursor'])
    if (commands.get(id)) commands.get(id)!.iconOnly = true
  for (const [id, label] of Object.entries({
    translate: 'Mover',
    rotate: 'Rotar',
    focus: 'Enfocar',
    photo: 'Capturar imagen',
    save: 'Guardar en este navegador',
    export: 'Descargar planeta JSON…',
  }))
    if (commands.get(id)) commands.get(id)!.label = label
  for (const [id, shortcut] of Object.entries({
    undo: 'Mod+Z',
    redo: 'Mod+Shift+Z',
    save: 'Mod+S',
    translate: 'G',
    rotate: 'R',
    focus: 'F',
    play: 'F8',
  }))
    if (commands.get(id)) commands.get(id)!.shortcut = shortcut
  const viewportPanel = document.createElement('section')
  viewportPanel.id = 'studio-viewport-panel'
  app.append(viewportPanel)
  const toolbar = document.querySelector('.toolbar')!
  viewportPanel.append(toolbar, viewport)
  const toolbarRoot = document.createElement('div')
  toolbarRoot.className = 'studio-view-header'
  toolbar.append(toolbarRoot)
  createApp({
    render: () =>
      h('div', { class: 'studio-view-header' }, [
        h(MenuBar, { registry: commands, menus: viewMenus, ...interactions }),
        h(CommandToolbar, {
          registry: commands,
          commands: ['play', 'photo'],
          iconOnly: true,
          label: 'Prueba y captura',
          onError: host.reportError,
        }),
      ]),
  }).mount(toolbarRoot)
  const tools = document.createElement('div')
  tools.className = 'studio-viewport-tools'
  viewport.append(tools)
  createApp({
    render: () =>
      h(CommandToolbar, {
        registry: commands,
        commands: toolCommands,
        label: 'Herramientas 3D',
        onError: host.reportError,
      }),
  }).mount(tools)
  document.querySelector('.view-caption')?.setAttribute('hidden', '')
  const clock = document.createElement('time')
  clock.id = 'studio-clock'
  const badge = document.querySelector('.project .badge')!
  badge.textContent = 'UTC'
  badge.before(clock)
  const header = document.createElement('div')
  header.className = 'studio-main-menu'
  document.querySelector('header .brand')!.after(header)
  createApp({
    render: () => h(MenuBar, { registry: commands, menus: mainMenus, ...interactions }),
  }).mount(header)
  const tree = document.getElementById('tree')!
  tree.replaceChildren()
  createApp(ScenePanel).mount(tree)
  const properties = document.getElementById('properties')!
  let native = document.getElementById('properties-extras')
  if (!native) {
    native = document.createElement('div')
    native.id = 'properties-extras'
    properties.append(native)
  }
  const inspectorRoot = document.createElement('div')
  inspectorRoot.id = 'studio-property-sheet'
  properties.prepend(inspectorRoot)
  createApp(Inspector).mount(inspectorRoot)
  document.querySelector('.outliner-footer')?.remove()
  const workspace = createWorkspace(),
    factories = new Map<string, ContentFactory>()
  const definitions = [
    { id: 'world', title: 'Vista 3D', selector: '#studio-viewport-panel' },
    { id: 'scene', title: 'Escena', selector: '.outliner' },
    { id: 'properties', title: 'Propiedades', selector: '.inspector' },
    ...[
      ['layers', 'Capas'],
      ['generation', 'Generación'],
      ['planet', 'Planeta'],
      ['information', 'Información'],
      ['sequences', 'Secuencias'],
      ['map', 'Mapa'],
    ].map(([id, title]) => ({
      id,
      title,
      selector: '#studio-' + id,
    })),
  ]
  let coverage: ReturnType<typeof mountCoverageMap> | undefined
  for (const panel of definitions.slice(3)) {
    const node = document.createElement('section')
    node.id = 'studio-' + panel.id
    node.className = 'studio-content-panel'
    app.append(node)
    if (panel.id === 'layers')
      createApp({
        render: () =>
          h('div', [
            h(HostContent, { node: contents.layerActions }),
            h(ContentSections, { sections: contents.layers }),
          ]),
      }).mount(node)
    else if (panel.id === 'planet') {
      node.classList.add('studio-planet')
      createApp({
        render: () => h(ContentSections, { sections: contents.planetSections }),
      }).mount(node)
    } else if (panel.id === 'information') createApp(InformationPanel).mount(node)
    else if (panel.id === 'map') coverage = mountCoverageMap(node)
    else node.textContent = panel.title + ' · siguiente fase'
  }
  for (const panel of definitions) {
    const element = app.querySelector<HTMLElement>(panel.selector)!
    workspace.register({ id: panel.id, title: panel.title })
    factories.set(panel.id, (container) => {
      container.append(element)
      return {
        setActive: panel.id === 'world' ? (value) => host.input.setActive(value) : undefined,
        setVisible:
          panel.id === 'world'
            ? (value) => host.input.setVisible(value)
            : panel.id === 'map'
              ? (value) => coverage?.setVisible(value)
              : undefined,
        dispose: () => contents.parking.append(element),
      }
    })
    register(panel.id, panel.title, () => {
      workspace.open(panel.id)
      workspace.activate(panel.id)
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
      first: {
        kind: 'split',
        id: 'work',
        axis: 'vertical',
        ratio: 0.8,
        first: { kind: 'tabs', id: 'world-tabs', tabs: ['world', 'map'], active: 'world' },
        second: {
          kind: 'tabs',
          id: 'bottom-tabs',
          tabs: ['information', 'sequences'],
          active: 'information',
        },
      },
      second: {
        kind: 'split',
        id: 'sidebar',
        axis: 'vertical',
        ratio: 0.43,
        first: {
          kind: 'tabs',
          id: 'scene-tabs',
          tabs: ['scene', 'layers', 'generation'],
          active: 'scene',
        },
        second: {
          kind: 'tabs',
          id: 'properties-tabs',
          tabs: ['properties', 'planet'],
          active: 'properties',
        },
      },
    },
  }
  const compact = matchMedia('(max-width:700px)').matches
  if (compact)
    defaults.root = {
      kind: 'tabs',
      id: 'mobile-tabs',
      tabs: definitions.map((p) => p.id),
      active: 'world',
    }
  const layoutKey = compact ? 'nabla.studio.layout.mobile.v4' : 'nabla.studio.layout.v5'
  workspace.restore(defaults)
  try {
    const saved = localStorage.getItem(layoutKey)
    if (saved) workspace.restore(JSON.parse(saved))
  } catch {
    /* Use the default layout. */
  }
  const placed = workspace.snapshot()
  if (!layoutHas(placed, 'map')) {
    const group =
      tabGroup(placed.root, 'world') ??
      placed.floating.find((item) => item.group.tabs.includes('world'))?.group.id
    const keep = placed.active
    if (!group || !workspace.dock('map', group, 'center')) workspace.open('map')
    if (keep) workspace.activate(keep)
  }
  workspace.subscribe(() => {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(workspace.snapshot()))
    } catch {
      /* Storage can be unavailable. */
    }
  })
  register('reset-layout', 'Restablecer distribución', () => workspace.restore(defaults))
  const root = document.createElement('section')
  root.className = 'studio-workspace'
  app.append(root)
  createApp({
    render: () =>
      h(
        WorkspaceHost,
        {
          workspace,
          ...interactions,
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
  const windows = document.createElement('div')
  document.body.append(windows)
  const helpTab = ref('controls')
  createApp({
    render: () => [
      h(PreferencesWindow, { tabs: contents.preferences, input: host.input }),
      h(CapabilityWindow, { input: host.input }),
      h(
        DesktopDialog,
        {
          open: helpOpen.value,
          'onUpdate:open': (value: boolean) => {
            helpOpen.value = value
          },
          title: 'Ayuda',
          icon: 'help',
          closeLabel: 'Cerrar ayuda',
          modal: false,
          draggable: true,
          registry: commands,
          class: 'studio-utility',
          ...interactions,
        },
        {
          default: () =>
            h(
              SidebarTabs,
              { modelValue: helpTab.value, tabs: [{ id: 'controls', label: 'Controles' }] },
              { controls: () => h(ContentSections, { sections: contents.help }) },
            ),
        },
      ),
    ],
  }).mount(windows)
  const compactPanels = () => {
    for (const panel of root.querySelectorAll<HTMLElement>('.nd-panel-content,.nd-drop-grid'))
      for (const dimension of ['top', 'height'] as const) {
        const key = '--studio-panel-' + dimension
        if (panel.style.getPropertyValue(key) !== panel.style[dimension])
          panel.style.setProperty(key, panel.style[dimension])
      }
  }
  new MutationObserver(compactPanels).observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
  })
  compactPanels()
  window.addEventListener('error', (event) => log(event.message, 'error'))
  log('Studio preparado. Información muestra la actividad del editor.')
  host.refresh()
  commands.notify()
}
