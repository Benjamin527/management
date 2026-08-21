<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { revealHandoffSecret } from "../../api/handoffProfiles";
import { useAuthStore } from "../../stores/auth";

const props = defineProps<{ profileId: string; masked: string | null }>();
const auth = (() => {
  try {
    return useAuthStore();
  } catch {
    return { user: null };
  }
})();
const canReveal = computed(() => auth.user?.role === "ADMIN");
const value = ref("");
const loading = ref(false);
const error = ref("");

async function reveal() {
  loading.value = true;
  error.value = "";
  try {
    const result = await revealHandoffSecret(
      props.profileId,
      "deploymentChecklist",
    );
    value.value = result.value;
  } catch (reason) {
    error.value =
      reason instanceof Error ? reason.message : "受保护信息读取失败";
  } finally {
    loading.value = false;
  }
}

function hide() {
  value.value = "";
}
onBeforeUnmount(hide);
</script>

<template>
  <div class="protected-field">
    <div class="protected-heading">
      <span>部署检查清单</span><small>PROTECTED</small>
    </div>
    <pre v-if="value" data-secret-value>{{ value }}</pre>
    <p v-else>{{ masked || "未填写" }}</p>
    <span v-if="error" class="protected-error" role="alert">{{ error }}</span>
    <button
      v-if="value"
      class="ghost-button"
      data-action="hide-handoff-secret"
      @click="hide"
    >
      隐藏敏感内容
    </button>
    <button
      v-else-if="canReveal"
      class="ghost-button"
      data-action="reveal-handoff-secret"
      :disabled="loading"
      @click="reveal"
    >
      {{ loading ? "安全读取中…" : "管理员查看原文" }}
    </button>
    <small v-else>仅管理员可按需查看原文，操作会记录审计日志。</small>
  </div>
</template>

<style scoped>
.protected-field {
  padding: 14px;
  border: 1px solid #e6d7b8;
  border-radius: 10px;
  background: #fffaf1;
}
.protected-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.protected-heading span {
  font-size: 10px;
  font-weight: 650;
}
.protected-heading small {
  color: #aa6b17;
  font:
    650 8px ui-monospace,
    monospace;
  letter-spacing: 0.12em;
}
.protected-field p,
.protected-field pre {
  margin: 10px 0 0;
  color: #6f624e;
  font: 10px/1.65 inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.protected-field pre {
  padding: 10px;
  border-radius: 7px;
  background: #332b20;
  color: #fff4df;
}
.protected-field > small,
.protected-error {
  display: block;
  margin-top: 9px;
  color: #8f806b;
  font-size: 9px;
}
.protected-error {
  color: var(--red);
}
.protected-field .ghost-button {
  margin: 11px 0 0;
  padding: 7px 10px;
}
</style>
