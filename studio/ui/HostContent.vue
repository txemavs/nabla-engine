<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
const props = defineProps<{ node: HTMLElement }>()
const host = ref<HTMLElement | null>(null)
onMounted(() => host.value?.append(props.node))
onBeforeUnmount(() => document.getElementById('studio-host-controls')?.append(props.node))
</script>
<template><div ref="host" class="studio-host-content" /></template>
