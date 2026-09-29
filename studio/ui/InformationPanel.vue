<script setup lang="ts">
import { LogView } from '@nabla/desktop'
import { logEntries } from './state'
const labels = {
  all: 'Toda la actividad',
  info: 'Información',
  warning: 'Avisos',
  error: 'Errores',
  clear: 'Limpiar',
  filter: 'Filtrar información',
  log: 'Consola de desarrollo',
}
</script>
<template><LogView :entries="logEntries" :labels="labels" @clear="logEntries = []" /></template>
