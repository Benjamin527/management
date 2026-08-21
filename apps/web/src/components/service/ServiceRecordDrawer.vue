<script setup lang="ts">
import { computed, toRef } from "vue";
import type { ServiceRecordDetail } from "../../types/service";
import { useOverlayLayer } from "../../composables/useOverlayLayer";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: string;
  record: ServiceRecordDetail | null;
}>();
const emit = defineEmits<{ close: [] }>();
useOverlayLayer(toRef(props, "open"), () => emit("close"));

const statusLabels = {
  RESOLVED: "已解决",
  CLOSED: "已关闭",
  IN_PROGRESS: "跟进中",
  WAITING_REPLY: "待回复",
  ESCALATED: "飞书项目",
  UNKNOWN: "数据缺失",
  OTHER: "其他状态",
};
const rawJson = computed(() =>
  JSON.stringify(props.record?.rawFields ?? {}, null, 2),
);
function dateTime(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
        hour12: false,
      }).format(new Date(value))
    : "—";
}
</script>

<template>
  <Teleport to="body"
    ><div
      v-if="open"
      class="record-drawer-backdrop"
      @click.self="emit('close')"
    >
      <aside
        class="record-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="服务记录详情"
      >
        <header>
          <div>
            <small>FEISHU SERVICE RECORD</small>
            <h2>
              {{
                record?.serviceRecordNo
                  ? `#${record.serviceRecordNo}`
                  : "服务记录详情"
              }}
            </h2>
          </div>
          <button aria-label="关闭" @click="$emit('close')">×</button>
        </header>
        <div v-if="loading" class="drawer-state">
          <span class="loading-orbit"></span><strong>正在读取完整记录</strong>
        </div>
        <div v-else-if="error" class="drawer-state error-state">
          <strong>记录详情读取失败</strong>
          <p>{{ error }}</p>
        </div>
        <template v-else-if="record">
          <section class="drawer-lead">
            <span>{{ record.customerName }}</span>
            <h3>{{ record.summary || "未填写反馈内容" }}</h3>
            <div>
              <b :data-status="record.normalizedStatus">{{
                statusLabels[record.normalizedStatus]
              }}</b
              ><small>{{ dateTime(record.startDate) }}</small>
            </div>
          </section>
          <section class="drawer-grid">
            <div>
              <span>反馈来源</span
              ><strong>{{ record.sourceType || "未填写" }}</strong>
            </div>
            <div>
              <span>反馈类型</span
              ><strong>{{ record.feedbackTypeNormalized || "未填写" }}</strong
              ><small
                v-if="record.feedbackTypeRaw !== record.feedbackTypeNormalized"
                >原值 {{ record.feedbackTypeRaw }}</small
              >
            </div>
            <div>
              <span>问题类型</span
              ><strong>{{ record.issueTypeNormalized || "未填写" }}</strong
              ><small v-if="record.issueTypeRaw !== record.issueTypeNormalized"
                >原值 {{ record.issueTypeRaw }}</small
              >
            </div>
            <div>
              <span>部署形态</span
              ><strong>{{ record.deploymentType || "未填写" }}</strong>
            </div>
            <div>
              <span>提问者和角色</span
              ><strong>{{ record.questionerRole || "未填写" }}</strong>
            </div>
            <div>
              <span>客户满意度</span
              ><strong>{{ record.satisfaction ?? "未填写" }}</strong>
            </div>
            <div>
              <span>工单 ID</span
              ><strong>{{ record.ticketId || "未关联" }}</strong>
            </div>
            <div>
              <span>重点问题</span
              ><strong>{{ record.keyIssue ? "是" : "否 / 未标记" }}</strong>
            </div>
          </section>
          <section class="drawer-section">
            <span>处理结论</span>
            <p>{{ record.conclusion || "尚未填写处理结论" }}</p>
          </section>
          <section class="handoff-chain">
            <div>
              <i>1</i><span>一线工程师</span
              ><strong>{{ record.firstLineEngineer || "未填写" }}</strong>
            </div>
            <b></b>
            <div>
              <i>2</i><span>二线工程师</span
              ><strong>{{ record.secondLineEngineer || "未填写" }}</strong>
            </div>
            <b></b>
            <div>
              <i>3</i><span>三线产研</span
              ><strong>{{ record.thirdLineEngineer || "未升级" }}</strong>
            </div>
          </section>
          <section class="drawer-grid timestamps">
            <div>
              <span>提交人</span
              ><strong>{{ record.submittedByName || "未填写" }}</strong>
            </div>
            <div>
              <span>提交时间</span
              ><strong>{{ dateTime(record.submittedAt) }}</strong>
            </div>
            <div>
              <span>飞书更新时间</span
              ><strong>{{ dateTime(record.sourceUpdatedAt) }}</strong>
            </div>
            <div>
              <span>系统同步时间</span
              ><strong>{{ dateTime(record.syncedAt) }}</strong>
            </div>
          </section>
          <details>
            <summary>查看原始飞书字段</summary>
            <pre>{{ rawJson }}</pre>
          </details>
          <footer>
            <a
              v-if="record.sourceUrl"
              :href="record.sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              >在飞书中查看服务表 ↗</a
            >
          </footer>
        </template>
      </aside>
    </div></Teleport
  >
</template>

<style scoped>
.record-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(8, 25, 39, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: flex-end;
}
.record-drawer {
  width: min(620px, 100%);
  height: 100vh;
  overflow: auto;
  background: #fff;
  padding: 25px;
  box-shadow: -24px 0 70px rgba(5, 23, 35, 0.2);
  animation: drawer-in 0.22s ease both;
}
.record-drawer > header {
  display: flex;
  justify-content: space-between;
  padding-bottom: 18px;
  border-bottom: 1px solid #dfe7e9;
}
.record-drawer header small {
  font:
    650 10px ui-monospace,
    monospace;
  letter-spacing: 0.16em;
  color: #159786;
}
.record-drawer h2 {
  margin: 6px 0 0;
  font-size: 21px;
}
.record-drawer header button {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: #f3f6f7;
  color: #70808d;
  font-size: 21px;
}
.drawer-state {
  min-height: 70vh;
  display: grid;
  place-items: center;
  align-content: center;
}
.drawer-lead {
  padding: 24px 0;
}
.drawer-lead > span {
  font-size: 11px;
  color: #159786;
  font-weight: 650;
}
.drawer-lead h3 {
  font-size: 19px;
  line-height: 1.55;
  margin: 9px 0 13px;
}
.drawer-lead > div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.drawer-lead b {
  padding: 6px 9px;
  border-radius: 14px;
  background: #dff4ef;
  color: #087c6c;
  font-size: 10px;
}
.drawer-lead b[data-status="WAITING_REPLY"],
.drawer-lead b[data-status="UNKNOWN"] {
  background: #fde9e7;
  color: #d65d57;
}
.drawer-lead b[data-status="IN_PROGRESS"] {
  background: #fff0d6;
  color: #aa6b17;
}
.drawer-lead b[data-status="ESCALATED"] {
  background: #eeeaf6;
  color: #725f9c;
}
.drawer-lead small {
  color: #70808d;
  font-size: 10px;
}
.drawer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid #dfe7e9;
  border-radius: 11px;
  overflow: hidden;
}
.drawer-grid > div {
  padding: 13px 14px;
  border-right: 1px solid #dfe7e9;
  border-bottom: 1px solid #dfe7e9;
}
.drawer-grid > div:nth-child(2n) {
  border-right: 0;
}
.drawer-grid > div:nth-last-child(-n + 2) {
  border-bottom: 0;
}
.drawer-grid span,
.drawer-section > span {
  display: block;
  color: #70808d;
  font-size: 9px;
}
.drawer-grid strong {
  display: block;
  margin-top: 5px;
  font-size: 11px;
}
.drawer-grid small {
  display: block;
  margin-top: 3px;
  color: #9a7a47;
  font-size: 8px;
}
.drawer-section {
  margin: 18px 0;
  padding: 15px;
  border-left: 3px solid #159786;
  background: #f5faf9;
}
.drawer-section p {
  margin: 7px 0 0;
  font-size: 11px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.handoff-chain {
  display: grid;
  grid-template-columns: 1fr 25px 1fr 25px 1fr;
  align-items: center;
  margin: 18px 0;
}
.handoff-chain div {
  min-height: 92px;
  padding: 12px;
  border: 1px solid #dfe7e9;
  border-radius: 10px;
}
.handoff-chain i {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #10253b;
  color: #fff;
  font:
    650 9px ui-monospace,
    monospace;
}
.handoff-chain span,
.handoff-chain strong {
  display: block;
}
.handoff-chain span {
  margin-top: 10px;
  color: #70808d;
  font-size: 9px;
}
.handoff-chain strong {
  margin-top: 4px;
  font-size: 10px;
}
.handoff-chain > b {
  height: 1px;
  background: #cad8dc;
}
.timestamps {
  margin-top: 18px;
}
.record-drawer details {
  margin: 18px 0;
  border: 1px solid #dfe7e9;
  border-radius: 10px;
  padding: 12px;
}
.record-drawer summary {
  cursor: pointer;
  color: #70808d;
  font-size: 10px;
}
.record-drawer pre {
  overflow: auto;
  max-height: 280px;
  margin: 12px 0 0;
  padding: 12px;
  border-radius: 7px;
  background: #10253b;
  color: #cbe1e5;
  font:
    10px/1.6 ui-monospace,
    monospace;
}
.record-drawer footer {
  position: sticky;
  bottom: -25px;
  margin: 0 -25px -25px;
  padding: 15px 25px;
  background: #fff;
  border-top: 1px solid #dfe7e9;
  text-align: right;
}
.record-drawer footer a {
  display: inline-block;
  padding: 10px 13px;
  border-radius: 8px;
  background: #159786;
  color: #fff;
  font-size: 11px;
  font-weight: 650;
}
@keyframes drawer-in {
  from {
    transform: translateX(30px);
    opacity: 0;
  }
}
@media (max-width: 560px) {
  .record-drawer {
    padding: 18px;
  }
  .drawer-grid {
    grid-template-columns: 1fr;
  }
  .drawer-grid > div {
    border-right: 0 !important;
    border-bottom: 1px solid #dfe7e9 !important;
  }
  .handoff-chain {
    grid-template-columns: 1fr;
  }
  .handoff-chain > b {
    height: 18px;
    width: 1px;
    margin: auto;
  }
  .record-drawer footer {
    bottom: -18px;
    margin: 0 -18px -18px;
    padding: 13px 18px;
  }
}
</style>
