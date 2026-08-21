<script setup lang="ts">
defineProps<{ message: string; tone?: "success" | "error" }>();
</script>
<template>
  <Teleport to="body"
    ><Transition name="toast"
      ><div
        v-if="message"
        :class="['app-toast', `tone-${tone || 'success'}`]"
        role="status"
      >
        <span>{{ tone === "error" ? "!" : "✓" }}</span
        >{{ message }}
      </div></Transition
    ></Teleport
  >
</template>
