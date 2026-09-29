import { shallowRef, ref } from 'vue'
import {
  createCommandRegistry,
  type PropertySection,
  type TreeNode,
  type LogEntry,
} from '@nabla/desktop/core'
export const commands = createCommandRegistry()
export const inspector = shallowRef<PropertySection[]>([])
export const sceneNodes = shallowRef<TreeNode[]>([])
export const hierarchyNodes = shallowRef<TreeNode[]>([])
export const transformSelection = shallowRef<() => void>(() => {})
export const selection = ref('')
export const preferencesOpen = ref(false)
export const helpOpen = ref(false)
export const capabilityOpen = ref(false)
export const capabilityTitle = ref('Capacidad')
export const capabilitySections = shallowRef<PropertySection[]>([])
export const logEntries = shallowRef<LogEntry[]>([])
export const cursorTool = ref(false)
export const objectMode = ref('object')
export const selectEntity = shallowRef<(id: string) => void>(() => {})
export const inspectCapability = shallowRef<() => void>(() => {})
export function log(message: string, level: LogEntry['level'] = 'info') {
  logEntries.value = [
    ...logEntries.value.slice(-499),
    { id: ++sequence, time: new Date().toLocaleTimeString(), level, message },
  ]
}
let sequence = 0
/** Register the operation once. Original controls remain valid during host migration. */
export function bindAction(id: string, execute: (event?: MouseEvent) => unknown, label?: string) {
  const node = document.getElementById(id) as HTMLButtonElement | null
  if (node)
    node.onclick = (event) => {
      execute(event)
    }
  const prior = commands.get(id)
  if (prior) {
    prior.execute = async () => {
      await execute()
    }
    commands.notify()
    return
  }
  commands.register({
    id,
    label: label ?? node?.textContent?.trim() ?? id,
    enabled: () => !node?.disabled,
    execute: async () => {
      await execute()
    },
  })
}
