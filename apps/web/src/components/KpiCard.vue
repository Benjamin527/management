<script setup lang="ts">
defineProps<{ label: string; value: string | number; note: string; tone?: 'normal' | 'risk' | 'good' }>()
</script>
<template>
  <article class="kpi-card" :class="`tone-${tone || 'normal'}`">
    <span class="kpi-label">{{ label }}</span>
    <strong>{{ value }}</strong>
    <small>{{ note }}</small>
  </article>
</template>
