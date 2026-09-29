<script setup lang="ts">
import { ref, watch } from 'vue'
import { DesktopDialog, PropertySheet } from '@nabla/desktop'
import { capabilityOpen, capabilityTitle, capabilitySections, commands, log } from './state'
import type { StudioInputOwner } from '../input-owner'
defineProps<{ input: StudioInputOwner }>()
const error = ref('')
watch([capabilityOpen, capabilitySections], () => {
  error.value = ''
})
function report(value: unknown) {
  error.value = String(value)
  log(error.value, 'error')
}
</script>
<template>
  <DesktopDialog
    v-model:open="capabilityOpen"
    :title="capabilityTitle"
    icon="settings"
    :registry="commands"
    :modal="false"
    draggable
    close-label="Cerrar capacidad"
    class="studio-utility"
    @interaction-start="input.beginInteraction()"
    @interaction-end="input.endInteraction()"
    ><PropertySheet :sections="capabilitySections" @error="report" />
    <p v-if="error" role="alert" class="studio-form-error">{{ error }}</p></DesktopDialog
  >
</template>

<style scoped>
.studio-form-error {
  color: #e6a39a;
  padding: 8px;
  white-space: normal;
}
</style>
