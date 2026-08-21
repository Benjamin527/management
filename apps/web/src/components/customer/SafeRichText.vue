<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ value: string | null | undefined }>();
const segments = computed(() => {
  const value = props.value?.trim() || "";
  if (!value) return [];
  return value
    .split(/(https?:\/\/[^\s]+)/g)
    .filter(Boolean)
    .map((text) => ({
      text,
      href: /^https?:\/\//i.test(text) ? text : null,
    }));
});
</script>

<template>
  <span v-if="segments.length" class="safe-rich-text">
    <template
      v-for="(segment, index) in segments"
      :key="`${segment.text}-${index}`"
    >
      <a
        v-if="segment.href"
        :href="segment.href"
        target="_blank"
        rel="noopener noreferrer"
        >{{ segment.text }}</a
      >
      <template v-else>{{ segment.text }}</template>
    </template>
  </span>
  <span v-else class="safe-rich-text empty">未填写</span>
</template>

<style scoped>
.safe-rich-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.safe-rich-text a {
  color: var(--teal);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.safe-rich-text.empty {
  color: #97a4ab;
}
</style>
