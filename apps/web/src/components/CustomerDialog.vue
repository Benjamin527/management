<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { createCustomer } from '../api/customers'
import type { CustomerDraft, CustomerStatus } from '../api/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const saving = ref(false)
const error = ref('')
const form = reactive<CustomerDraft>({ name: '', industry: '', level: '', status: 'ACTIVE' })

watch(() => props.open, (open) => {
  if (!open) return
  Object.assign(form, { name: '', industry: '', level: '', status: 'ACTIVE' as CustomerStatus })
  error.value = ''
})

async function submit() {
  if (!form.name.trim()) {
    error.value = '请输入客户名称'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await createCustomer({
      name: form.name.trim(),
      ...(form.industry?.trim() ? { industry: form.industry.trim() } : {}),
      ...(form.level?.trim() ? { level: form.level.trim() } : {}),
      status: form.status,
    })
    emit('saved')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '客户档案创建失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
    <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="customer-dialog-title">
      <header><div><small>NEW CUSTOMER</small><h2 id="customer-dialog-title">建立客户档案</h2></div><button class="icon-button" aria-label="关闭" @click="emit('close')">×</button></header>
      <form data-form="customer" @submit.prevent="submit">
        <label class="full-field">客户名称<span>*</span><input name="name" v-model="form.name" maxlength="100" placeholder="例如：太保" autofocus /></label>
        <label>所属行业<input name="industry" v-model="form.industry" placeholder="例如：保险" /></label>
        <label>客户级别<input name="level" v-model="form.level" placeholder="例如：战略客户" /></label>
        <label class="full-field">服务状态<select v-model="form.status"><option value="ONBOARDING">交接中</option><option value="ACTIVE">服务中</option><option value="AT_RISK">风险</option><option value="PAUSED">暂停</option><option value="ENDED">已结束</option></select></label>
        <p v-if="error" class="inline-error full-field">{{ error }}</p>
        <footer class="full-field"><button type="button" class="ghost-button" @click="emit('close')">取消</button><button class="primary-button" :disabled="saving">{{ saving ? '正在创建…' : '创建客户档案' }}</button></footer>
      </form>
    </section>
  </div>
</template>
