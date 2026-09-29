<script setup lang="ts">
import { ref } from 'vue'
import { DesktopDialog, SidebarTabs } from '@nabla/desktop'
import ContentSections from './ContentSections.vue'
import type { PreferencesTab } from './panels'
import { commands, preferencesOpen } from './state'
import type { StudioInputOwner } from '../input-owner'
defineProps<{ tabs: PreferencesTab[]; input: StudioInputOwner }>()
const selected = ref('interface')
</script>
<template>
  <DesktopDialog
    v-model:open="preferencesOpen"
    title="Preferencias"
    icon="settings"
    close-label="Cerrar preferencias"
    :registry="commands"
    :modal="false"
    draggable
    class="studio-utility"
    @interaction-start="input.beginInteraction()"
    @interaction-end="input.endInteraction()"
    ><SidebarTabs v-model="selected" :tabs="tabs"
      ><template v-for="tab in tabs" #[tab.id]
        ><ContentSections :sections="tab.sections" /></template></SidebarTabs
  ></DesktopDialog>
</template>
