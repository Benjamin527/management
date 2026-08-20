<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { listCustomers } from '../api/customers'
import { createIssue } from '../api/issues'
import type { Customer, IssueChannel, IssueDraft, IssuePriority } from '../api/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const customers = ref<Customer[]>([])
const loadingCustomers = ref(false)
const saving = ref(false)
const error = ref('')
const form = reactive<IssueDraft>({ serviceNo: '', customerId: '', title: '', description: '', channel: 'FEISHU', priority: 'MEDIUM' })

watch(() => props.open, async (open) => {
  if (!open) return
  Object.assign(form, { serviceNo: String(Date.now()).slice(-6), customerId: '', title: '', description: '', channel: 'FEISHU' as IssueChannel, priority: 'MEDIUM' as IssuePriority })
  error.value = ''
  loadingCustomers.value = true
  try {
    customers.value = (await listCustomers({ pageSize: 100 })).items
  } catch {
    error.value = '客户列表加载失败，请稍后重试'
  } finally {
    loadingCustomers.value = false
  }
}, { immediate: true })

async function submit() {
  if (!form.customerId || !form.serviceNo.trim() || !form.title.trim() || !form.description.trim()) {
    error.value = '请填写客户、服务编号、问题标题和问题描述'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await createIssue({ ...form, serviceNo: form.serviceNo.trim(), title: form.title.trim(), description: form.description.trim() })
    emit('saved')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '服务问题登记失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
    <section class="dialog-card issue-dialog" role="dialog" aria-modal="true" aria-labelledby="issue-dialog-title">
      <header><div><small>NEW SERVICE ISSUE</small><h2 id="issue-dialog-title">登记服务问题</h2></div><button class="icon-button" aria-label="关闭" @click="emit('close')">×</button></header>
      <form data-form="issue" @submit.prevent="submit">
        <label>服务编号<span>*</span><input v-model="form.serviceNo" name="serviceNo" placeholder="例如：4096" /></label>
        <label>客户<span>*</span><select v-model="form.customerId" name="customerId" :disabled="loadingCustomers"><option value="">{{ loadingCustomers ? '正在加载客户…' : '选择客户' }}</option><option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }}</option></select></label>
        <label class="full-field">问题标题<span>*</span><input v-model="form.title" name="title" maxlength="150" placeholder="用一句话描述客户的问题" /></label>
        <label class="full-field">问题描述<span>*</span><textarea v-model="form.description" name="description" rows="5" placeholder="记录现象、影响范围和客户诉求"></textarea></label>
        <label>反馈渠道<select v-model="form.channel" name="channel"><option value="FEISHU">飞书</option><option value="WECHAT">微信</option><option value="DINGTALK">钉钉</option><option value="PHONE">电话</option><option value="EMAIL">邮件</option><option value="FORM">服务表单</option><option value="OTHER">其他</option></select></label>
        <label>优先级<select v-model="form.priority" name="priority"><option value="LOW">低</option><option value="MEDIUM">中</option><option value="HIGH">高</option><option value="CRITICAL">紧急</option></select></label>
        <p v-if="error" class="inline-error full-field">{{ error }}</p>
        <footer class="full-field"><button type="button" class="ghost-button" @click="emit('close')">取消</button><button class="primary-button" :disabled="saving || loadingCustomers">{{ saving ? '正在登记…' : '加入服务队列' }}</button></footer>
      </form>
    </section>
  </div>
</template>
