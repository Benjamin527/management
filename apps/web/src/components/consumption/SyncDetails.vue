<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConsumptionAnalysis, ConsumptionSyncStatus } from '../../api/types'

const props = defineProps<{
  status: ConsumptionSyncStatus | null
  analysis: ConsumptionAnalysis | null
  canManage: boolean
  syncing: boolean
  error: string
}>()

const emit = defineEmits<{ sync: [] }>()
const open = ref(false)

const disabledReason = computed(() => {
  if (!props.canManage) return '仅管理员和经理可手动同步'
  if (!props.status?.enabled) return '服务器尚未配置消费数据源'
  if (props.status.running || props.syncing) return '同步任务正在运行'
  return ''
})

function dateTime(value: string | null | undefined) {
  if (!value) return '等待首次同步'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function openDetails() {
  open.value = true
}

defineExpose({ openDetails })
</script>

<template>
  <section class="sync-details">
    <button
      class="sync-summary"
      data-action="toggle-sync-details"
      :aria-expanded="open"
      aria-controls="consumption-sync-details"
      @click="open = !open"
    >
      <span><i :class="{ running: status?.running || syncing }"></i>数据与同步详情</span>
      <strong>{{ dateTime(status?.lastSuccessfulRun?.finishedAt) }}</strong>
      <em>{{ open ? '收起' : '展开' }}</em>
    </button>
    <div
      v-show="open"
      id="consumption-sync-details"
      data-sync-details
      class="sync-detail-body"
    >
      <div>
        <span>消费数据源</span>
        <strong>{{ status?.enabled ? '只读连接已配置' : '连接未配置' }}</strong>
      </div>
      <div>
        <span>本地 MySQL 快照</span>
        <strong>{{ status?.running ? '正在同步最近 28 天' : `${dateTime(status?.lastSuccessfulRun?.finishedAt)} 更新` }}</strong>
        <small v-if="status?.lastSuccessfulRun">{{ status.lastSuccessfulRun.accountCount }} 个账户 · {{ status.lastSuccessfulRun.rowCount }} 条日汇总</small>
      </div>
      <div>
        <span>分析数据截至</span>
        <strong>{{ analysis?.dataThrough || '等待首次同步' }}</strong>
        <small v-if="status?.nextScheduledAt">下次 {{ dateTime(status.nextScheduledAt) }}</small>
      </div>
      <div class="sync-detail-action">
        <button
          data-action="sync-consumption"
          :disabled="Boolean(disabledReason)"
          :title="disabledReason"
          @click="emit('sync')"
        >
          {{ syncing ? '启动中…' : status?.running ? '同步中…' : '立即同步' }}
        </button>
        <small v-if="disabledReason">{{ disabledReason }}</small>
      </div>
      <p v-if="error" class="sync-error">{{ error }}</p>
      <p v-else-if="status?.lastRun?.status === 'FAILED'" class="sync-error">
        最近同步失败：{{ status.lastRun.errorSummary }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.sync-details{border:1px solid var(--report-line);border-radius:12px;background:var(--report-surface);overflow:hidden}.sync-summary{width:100%;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:18px;min-height:48px;padding:0 16px;border:0;background:transparent;text-align:left}.sync-summary>span{display:flex;align-items:center;gap:8px;font-size:10px}.sync-summary i{width:7px;height:7px;border-radius:50%;background:var(--report-teal)}.sync-summary i.running{animation:sync-pulse 1s ease-in-out infinite}.sync-summary strong{font:600 9px ui-monospace,monospace;color:var(--report-muted)}.sync-summary em{color:var(--report-teal);font-size:9px}.sync-detail-body{display:grid;grid-template-columns:repeat(3,1fr) auto;gap:18px;align-items:center;padding:15px 16px;border-top:1px solid var(--report-line);background:#fbfcfc}.sync-detail-body span,.sync-detail-body small{display:block;color:var(--report-muted);font-size:9px}.sync-detail-body strong{display:block;margin-top:5px;font-size:10px}.sync-detail-body>div>small{margin-top:4px}.sync-detail-action{text-align:right}.sync-detail-action button{min-height:34px;padding:0 13px;border:0;border-radius:8px;background:var(--report-teal);color:#fff;font-size:10px;font-weight:650}.sync-detail-action button:disabled{opacity:.45}.sync-detail-action small{margin-top:5px}.sync-error{grid-column:1/-1;margin:0;padding-top:10px;border-top:1px solid #f0d5d2;color:var(--report-danger);font-size:10px}@keyframes sync-pulse{50%{opacity:.35;transform:scale(.8)}}@media(max-width:680px){.sync-summary{grid-template-columns:1fr auto}.sync-summary strong{display:none}.sync-detail-body{grid-template-columns:1fr}.sync-detail-action{text-align:left}}
</style>
