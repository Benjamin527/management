<script setup lang="ts">
import { ref, watch } from "vue";
import {
  linkHandoffProfile,
  listUnmatchedHandoffProfiles,
} from "../../api/handoffProfiles";
import type { Customer, UnmatchedHandoffProfile } from "../../api/types";

const props = defineProps<{ open: boolean; customers: Customer[] }>();
const emit = defineEmits<{ close: []; linked: [] }>();
const profiles = ref<UnmatchedHandoffProfile[]>([]);
const selections = ref<Record<string, string>>({});
const loading = ref(false);
const linkingId = ref("");
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    profiles.value = await listUnmatchedHandoffProfiles();
  } catch (reason) {
    error.value =
      reason instanceof Error ? reason.message : "未匹配档案加载失败";
  } finally {
    loading.value = false;
  }
}

async function link(profile: UnmatchedHandoffProfile) {
  const customerId = selections.value[profile.profileId];
  if (!customerId) return;
  linkingId.value = profile.profileId;
  error.value = "";
  try {
    await linkHandoffProfile(profile.profileId, customerId);
    profiles.value = profiles.value.filter(
      (item) => item.profileId !== profile.profileId,
    );
    emit("linked");
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "关联客户失败";
  } finally {
    linkingId.value = "";
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
);
</script>

<template>
  <div
    v-if="open"
    class="dialog-backdrop"
    role="presentation"
    @mousedown.self="emit('close')"
  >
    <section
      class="dialog-card unmatched-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unmatched-title"
    >
      <header>
        <div>
          <small>UNMATCHED HANDOFF</small>
          <h2 id="unmatched-title">待关联交接档案</h2>
          <p>飞书客户名称未能唯一匹配时，在这里人工确认一次。</p>
        </div>
        <button class="icon-button" aria-label="关闭" @click="emit('close')">
          ×
        </button>
      </header>

      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <div v-if="loading" class="unmatched-state">正在读取未匹配档案…</div>
      <div v-else-if="!profiles.length" class="unmatched-state">
        <strong>未匹配队列已清空</strong>
        <span>当前飞书交接档案都已进入客户档案。</span>
      </div>
      <div v-else class="unmatched-list">
        <article v-for="profile in profiles" :key="profile.profileId">
          <div class="unmatched-profile">
            <span>{{ profile.deploymentType || "未填写部署方式" }}</span>
            <strong>{{ profile.customerName }}</strong>
            <small>
              {{ profile.handoffPeople.join("、") || "未填写交接人" }} ·
              {{ profile.handoffAt?.slice(0, 10) || "未填写交接日期" }}
            </small>
          </div>
          <div class="unmatched-link">
            <select
              v-model="selections[profile.profileId]"
              :data-link-customer="profile.profileId"
            >
              <option value="">选择系统客户</option>
              <option
                v-for="customer in customers"
                :key="customer.id"
                :value="customer.id"
              >
                {{ customer.name }}
              </option>
            </select>
            <button
              class="primary-button"
              :data-link-profile="profile.profileId"
              :disabled="
                !selections[profile.profileId] ||
                linkingId === profile.profileId
              "
              @click="link(profile)"
            >
              {{ linkingId === profile.profileId ? "关联中…" : "确认关联" }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.unmatched-dialog {
  width: min(760px, 100%);
}
.unmatched-dialog header p {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 10px;
}
.unmatched-dialog > .inline-error {
  margin-top: 16px;
}
.unmatched-state {
  min-height: 190px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  color: var(--muted);
  font-size: 11px;
}
.unmatched-state strong {
  color: var(--ink);
  font-size: 13px;
}
.unmatched-list {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}
.unmatched-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.8fr);
  align-items: center;
  gap: 18px;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #f9fbfb;
}
.unmatched-profile span,
.unmatched-profile small {
  display: block;
  color: var(--muted);
  font-size: 9px;
}
.unmatched-profile span {
  color: var(--teal);
  font:
    650 9px ui-monospace,
    monospace;
  letter-spacing: 0.08em;
}
.unmatched-profile strong {
  display: block;
  margin: 6px 0;
  font-size: 13px;
}
.unmatched-link {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.unmatched-link select {
  height: 38px;
  margin: 0;
}
.unmatched-link button {
  white-space: nowrap;
}
@media (max-width: 680px) {
  .unmatched-list article {
    grid-template-columns: 1fr;
  }
  .unmatched-link {
    grid-template-columns: 1fr;
  }
}
</style>
