<script setup lang="ts">
import { ref, toRef, watch } from "vue";
import { createCustomer } from "../api/customers";
import type { CustomerDraft } from "../api/types";
import { parseCustomerCsv } from "../utils/customerCsv";
import { useOverlayLayer } from "../composables/useOverlayLayer";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  completed: [result: { success: number; failed: number }];
}>();
useOverlayLayer(toRef(props, "open"), () => emit("close"));
const rows = ref<CustomerDraft[]>([]);
const errors = ref<string[]>([]);
const filename = ref("");
const importing = ref(false);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    rows.value = [];
    errors.value = [];
    filename.value = "";
  },
);

async function chooseFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  filename.value = file.name;
  const result = parseCustomerCsv(await file.text());
  rows.value = result.rows;
  errors.value = result.errors;
}

async function confirmImport() {
  importing.value = true;
  const results = await Promise.allSettled(
    rows.value.map((row) => createCustomer(row)),
  );
  const success = results.filter(
    (result) => result.status === "fulfilled",
  ).length;
  const failed = results.length - success;
  importing.value = false;
  emit("completed", { success, failed });
}
</script>

<template>
  <Teleport to="body"
    ><div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
      <section
        class="dialog-card import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
      >
        <header>
          <div>
            <small>CSV CUSTOMER IMPORT</small>
            <h2 id="import-dialog-title">导入客户档案</h2>
          </div>
          <button class="icon-button" aria-label="关闭" @click="emit('close')">
            ×
          </button>
        </header>
        <label class="upload-zone"
          ><input
            type="file"
            accept=".csv,text/csv"
            @change="chooseFile"
          /><span>↑</span><strong>{{ filename || "选择 CSV 文件" }}</strong
          ><small>表头支持：客户名称、行业、客户级别、状态</small></label
        >
        <div v-if="rows.length" class="import-preview">
          <div>
            <strong>识别到 {{ rows.length }} 家客户</strong
            ><span>导入前请确认名称和行业</span>
          </div>
          <ul>
            <li v-for="row in rows.slice(0, 6)" :key="row.name">
              <strong>{{ row.name }}</strong
              ><span
                >{{ row.industry || "未填写行业" }} ·
                {{ row.level || "未设置级别" }}</span
              >
            </li>
          </ul>
          <small v-if="rows.length > 6"
            >另有 {{ rows.length - 6 }} 家客户未展开</small
          >
        </div>
        <div v-if="errors.length" class="import-errors">
          <strong>需要检查</strong>
          <p v-for="item in errors.slice(0, 4)" :key="item">{{ item }}</p>
        </div>
        <footer>
          <button class="ghost-button" @click="emit('close')">取消</button
          ><button
            class="primary-button"
            data-action="confirm-import"
            :disabled="!rows.length || importing"
            @click="confirmImport"
          >
            {{
              importing ? "正在导入…" : `确认导入 ${rows.length || ""} 家客户`
            }}
          </button>
        </footer>
      </section>
    </div></Teleport
  >
</template>
