<script setup lang="ts">
import { SettingsGroup } from '@nabla/desktop'
import HostContent from './HostContent.vue'
import type { ContentSection } from './panels'
defineProps<{ sections: ContentSection[] }>()
</script>
<template>
  <SettingsGroup
    v-for="section in sections"
    :key="section.id"
    :label="section.label"
    :open="section.open ?? true"
    ><HostContent :node="section.node"
  /></SettingsGroup>
</template>
