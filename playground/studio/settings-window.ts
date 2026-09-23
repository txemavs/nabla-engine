import { createApp, h, ref, watch } from 'vue'
import { createPinia } from 'pinia'
import { defineWindowsStore, WindowHost, ExternalContent } from '@nabla/desktop'
import type { ContentFactory } from '@nabla/desktop/core'
import type { StudioInputOwner } from './input-owner.js'

/** Retains the real settings controls and their existing application listeners. */
export function mountSettingsWindow(input: StudioInputOwner): void {
  const store = defineWindowsStore('studio-settings')(createPinia())
  store.register('settings', {
    title: 'Opciones del proyecto',
    width: 600,
    height: 650,
    x: 280,
    y: 110,
    open: false,
    keepAlive: true,
  })
  const tabs = [
    { id: 'performance-section', title: 'Rendimiento' },
    { id: 'sky-section', title: 'Sol y luna' },
    { id: 'geography-section', title: 'Ubicación' },
  ]
  const factories = new Map<string, ContentFactory>()
  for (const tab of tabs) {
    const element = document.getElementById(tab.id)! as HTMLDetailsElement
    factories.set(tab.id, (host) => {
      element.open = true
      host.append(element)
      return { dispose: () => document.getElementById('options-menu')!.append(element) }
    })
  }
  document.getElementById('geography-section')!.append(document.getElementById('css-screen-demo')!)
  const button = document.getElementById('options-menu-button')!
  button.removeAttribute('popovertarget')
  button.onclick = () => store.openWindow('settings')
  const root = document.createElement('div')
  root.className = 'studio-settings-host'
  document.body.append(root)
  createApp({
    setup() {
      const selected = ref(tabs[0].id)
      watch(
        () => {
          const w = store.windows.get('settings')!
          return w.open && !w.minimized
        },
        (open) => (open ? input.beginInteraction() : input.endInteraction()),
      )
      return () =>
        h(
          WindowHost,
          { store, mode: 'viewport' },
          {
            default: () => [
              h(
                'div',
                { class: 'studio-settings-tabs', role: 'tablist', 'aria-label': 'Opciones' },
                tabs.map((tab, index) =>
                  h(
                    'button',
                    {
                      role: 'tab',
                      id: `settings-tab-${tab.id}`,
                      'aria-selected': selected.value === tab.id,
                      'aria-controls': `settings-panel-${tab.id}`,
                      tabindex: selected.value === tab.id ? 0 : -1,
                      onClick: () => {
                        selected.value = tab.id
                      },
                      onKeydown: (event: KeyboardEvent) => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                        event.preventDefault()
                        const next =
                          event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? tabs.length - 1
                              : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) %
                                tabs.length
                        selected.value = tabs[next].id
                        document.getElementById(`settings-tab-${tabs[next].id}`)?.focus()
                      },
                    },
                    tab.title,
                  ),
                ),
              ),
              ...tabs.map((tab) =>
                h(
                  'section',
                  {
                    key: tab.id,
                    role: 'tabpanel',
                    id: `settings-panel-${tab.id}`,
                    'aria-labelledby': `settings-tab-${tab.id}`,
                    hidden: selected.value !== tab.id,
                    class: 'studio-settings-content',
                  },
                  [
                    h(ExternalContent, {
                      mount: factories.get(tab.id)!,
                      visible: selected.value === tab.id,
                    }),
                  ],
                ),
              ),
            ],
          },
        )
    },
  }).mount(root)
}
