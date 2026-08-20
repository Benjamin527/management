<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getServiceSyncStatus, runServiceSync } from '../../api/serviceSync'
import { useAuthStore } from '../../stores/auth'
import type { ServiceSyncRequestMode, ServiceSyncStatus } from '../../types/service'

const auth = useAuthStore()
const status = ref<ServiceSyncStatus | null>(null)
const loading = ref(true)
const error = ref('')
const action = ref<ServiceSyncRequestMode | null>(null)
let pollTimer: number | null = null

const canManage = computed(() => ['ADMIN', 'MANAGER'].includes(auth.user?.role ?? ''))
const successful = computed(() => status.value?.lastSuccessfulRun)

function dateTime(value: string | null | undefined) {
  if (!value) return '尚未成功同步'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

async function loadStatus() {
  try {
    status.value = await getServiceSyncStatus()
    error.value = ''
    if (status.value.running) startPolling()
    else stopPolling()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '同步状态读取失败'
  } finally {
    loading.value = false
  }
}

async function run(mode: ServiceSyncRequestMode) {
  action.value = mode
  error.value = ''
  try {
    await runServiceSync(mode)
    if (status.value) status.value.running = true
    startPolling()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '同步任务未能启动'
  } finally {
    action.value = null
  }
}

function startPolling() {
  if (pollTimer !== null) return
  pollTimer = window.setInterval(() => void loadStatus(), 3000)
}

function stopPolling() {
  if (pollTimer === null) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

onMounted(() => void loadStatus())
onBeforeUnmount(stopPolling)
</script>

<template>
  <section class="sync-track" :class="{ running: status?.running }" aria-live="polite">
    <div class="track-source"><span>飞书源表</span><strong>{{ status?.enabled ? '连接已配置' : '同步未配置' }}</strong></div>
    <i class="track-line"><b></b></i>
    <div class="track-state"><span>MySQL 镜像</span><strong v-if="loading">正在读取状态…</strong><strong v-else-if="status?.running">正在同步最新记录</strong><strong v-else>{{ dateTime(successful?.finishedAt) }} 更新</strong><small v-if="successful">读取 {{ successful.readCount }} · 新增 {{ successful.createdCount }} · 更新 {{ successful.updatedCount }} · 失败 {{ successful.failedCount }}</small></div>
    <i class="track-line"><b></b></i>
    <div class="track-result"><span>分析可用</span><strong>{{ successful ? '基于最近成功数据' : '等待首次全年同步' }}</strong><small v-if="status?.nextScheduledAt">下次 {{ dateTime(status.nextScheduledAt) }}</small></div>
    <div class="track-actions">
      <a v-if="status?.sourceUrl" data-testid="open-feishu" :href="status.sourceUrl" target="_blank" rel="noopener noreferrer">打开飞书服务表 ↗</a>
      <template v-if="canManage">
        <button data-testid="sync-recent" :disabled="Boolean(status?.running || action)" @click="run('recent')">{{ action === 'recent' ? '启动中…' : '同步最近数据' }}</button>
        <button class="quiet" :disabled="Boolean(status?.running || action)" @click="run('full-year')">重建 2026</button>
      </template>
    </div>
    <p v-if="error" class="sync-error">{{ error }}</p>
    <p v-else-if="status?.lastRun?.status === 'FAILED'" class="sync-error">最近同步失败：{{ status.lastRun.errorSummary }}</p>
  </section>
</template>

<style scoped>
.sync-track{display:grid;grid-template-columns:minmax(120px,.7fr) 70px minmax(210px,1.2fr) 70px minmax(150px,.8fr) auto;align-items:center;gap:12px;padding:16px 18px;border:1px solid #dfe7e9;border-radius:14px;background:#fff;box-shadow:0 8px 28px rgba(16,37,59,.035)}
.sync-track span,.sync-track small{display:block;color:#70808d;font-size:10px}.sync-track strong{display:block;margin-top:5px;font-size:12px}.track-state small,.track-result small{margin-top:4px}.track-line{height:1px;background:#cad8dc;position:relative}.track-line b{position:absolute;right:0;top:-3px;width:7px;height:7px;border-radius:50%;background:#159786}.running .track-line b{animation:track-pulse 1.2s ease-in-out infinite}.track-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.track-actions a{width:100%;text-align:right;color:#159786;font-size:11px;font-weight:650}.track-actions button{border:0;border-radius:8px;padding:8px 10px;background:#159786;color:#fff;font-size:10px;font-weight:650}.track-actions button.quiet{background:#eef3f4;color:#496171}.track-actions button:disabled{opacity:.5;cursor:not-allowed}.sync-error{grid-column:1/-1;margin:0;padding-top:10px;border-top:1px solid #f0d5d2;color:#d65d57;font-size:11px}
@keyframes track-pulse{50%{transform:scale(1.7);box-shadow:0 0 0 4px rgba(21,151,134,.12)}}
@media(max-width:1050px){.sync-track{grid-template-columns:1fr 32px 1.4fr 32px 1fr}.track-actions{grid-column:1/-1;justify-content:flex-start}.track-actions a{width:auto;text-align:left;margin-right:auto}}
@media(max-width:680px){.sync-track{grid-template-columns:1fr}.track-line{width:1px;height:18px;margin-left:5px}.track-line b{right:-3px;top:auto;bottom:0}.track-actions{display:grid;grid-template-columns:1fr 1fr}.track-actions a{grid-column:1/-1;margin-bottom:4px}.track-actions button{width:100%}}
</style>
