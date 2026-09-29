<script setup lang="ts">
import { ref, computed } from 'vue'
import { TreeView } from '@nabla/desktop'
import { sceneNodes, hierarchyNodes, selection, selectEntity } from './state'
const mode = ref('hierarchy')
const nodes = computed(() => (mode.value === 'hierarchy' ? hierarchyNodes.value : sceneNodes.value))
</script>
<template>
  <div class="studio-scene-heading">
    <span>Objetos</span>
    <select v-model="mode" aria-label="Organización de Escena">
      <option value="hierarchy">Jerarquía</option>
      <option value="class">Por clase</option>
    </select>
  </div>
  <TreeView
    :nodes="nodes"
    :selected="selection"
    label="Objetos de la escena"
    @select="selectEntity($event)"
  />
</template>
<style scoped>
.studio-scene-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
}
.studio-scene-heading select {
  margin-left: auto;
  width: auto;
  max-width: 65%;
  background: var(--nd-surface, #292929);
  color: inherit;
  border: 1px solid var(--nd-border, #444);
  border-radius: 3px;
  font: inherit;
  padding: 3px 6px;
}
</style>
