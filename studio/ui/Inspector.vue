<script setup lang="ts">
import { PropertySheet } from '@nabla/desktop'
import { inspector, log } from './state'
</script>
<template><PropertySheet :sections="inspector" @error="log(String($event), 'error')" /></template>
