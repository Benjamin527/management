<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { getCustomer } from "../api/customers";
import { listServiceRecords } from "../api/serviceRecords";
import type { CustomerDetail } from "../api/types";
import HandoffSecretField from "../components/customer/HandoffSecretField.vue";
import SafeRichText from "../components/customer/SafeRichText.vue";
import type {
  ServiceRecordListItem,
  ServiceRecordStatus,
} from "../types/service";

const route = useRoute();
const customer = ref<CustomerDetail | null>(null);
const records = ref<ServiceRecordListItem[]>([]);
const loading = ref(true);
const error = ref("");
const maxMonth = computed(() =>
  Math.max(
    ...(customer.value?.service2026.monthlyTrend.map((item) => item.count) ?? [
      1,
    ]),
    1,
  ),
);
const statusLabels: Record<ServiceRecordStatus, string> = {
  RESOLVED: "已解决",
  CLOSED: "已关闭",
  IN_PROGRESS: "跟进中",
  WAITING_REPLY: "待回复",
  ESCALATED: "飞书项目",
  UNKNOWN: "数据缺失",
  OTHER: "其他",
};

function shortDate(value: string | null) {
  return value ? value.slice(0, 10) : "未填写";
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const id = String(route.params.id);
    const [customerResult, recordResult] = await Promise.all([
      getCustomer(id),
      listServiceRecords({ customerId: id, page: 1, pageSize: 5 }),
    ]);
    customer.value = customerResult;
    records.value = recordResult.items;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "客户详情加载失败";
  } finally {
    loading.value = false;
  }
}
onMounted(() => void load());
</script>

<template>
  <section class="page-stack customer-detail-page">
    <div v-if="loading" class="panel analysis-state">
      <span class="loading-orbit"></span><strong>正在整理客户服务档案</strong>
    </div>
    <div v-else-if="error" class="panel analysis-state error-state">
      <strong>客户详情加载失败</strong>
      <p>{{ error }}</p>
      <button class="ghost-button" @click="load">重新加载</button>
    </div>
    <template v-else-if="customer">
      <div class="customer-identity">
        <div>
          <RouterLink to="/customers">← 返回客户中心</RouterLink
          ><span>ENTERPRISE SERVICE PROFILE · 2026</span>
          <h2>{{ customer.name }}</h2>
          <p>
            {{ customer.industry || "未填写行业" }} ·
            {{ customer.level || "未设置级别" }} · 负责人
            {{ customer.owner?.name || "未分配" }}
          </p>
        </div>
        <div>
          <RouterLink :to="`/consumption?customerId=${customer.id}`"
            >查看消费分析</RouterLink
          ><RouterLink
            class="primary"
            :to="`/service-records?customerId=${customer.id}`"
            >查看全部服务记录</RouterLink
          >
        </div>
      </div>

      <article
        v-if="customer.handoffProfile"
        class="panel handoff-profile-panel"
      >
        <header>
          <div>
            <small>FEISHU HANDOFF DOSSIER</small>
            <h2>售后交接档案</h2>
          </div>
          <div class="handoff-freshness">
            <strong>{{
              customer.handoffProfile.handoffStatus || "未填写状态"
            }}</strong
            ><span
              >源数据更新
              {{ shortDate(customer.handoffProfile.sourceUpdatedAt) }}</span
            >
          </div>
        </header>

        <div class="handoff-overview">
          <div>
            <span>部署方式</span
            ><strong>{{
              customer.handoffProfile.deploymentType || "未填写"
            }}</strong>
          </div>
          <div>
            <span>交接人员</span
            ><strong>{{
              customer.handoffProfile.handoffPeople.join("、") || "未填写"
            }}</strong>
          </div>
          <div>
            <span>交接日期</span
            ><strong>{{ shortDate(customer.handoffProfile.handoffAt) }}</strong>
          </div>
          <div>
            <span>镜像时间</span
            ><strong>{{ shortDate(customer.handoffProfile.syncedAt) }}</strong>
          </div>
        </div>

        <div class="handoff-grid">
          <section class="handoff-section deployment-section">
            <div class="section-heading">
              <span>01</span>
              <div>
                <small>DEPLOYMENT & SITES</small>
                <h3>部署与站点</h3>
              </div>
            </div>
            <div class="field-block">
              <label>SAAS 站点</label>
              <div class="chip-list">
                <span
                  v-for="site in customer.handoffProfile.saasSites"
                  :key="site"
                  ><SafeRichText :value="site" /></span
                ><em v-if="!customer.handoffProfile.saasSites.length"
                  >未填写</em
                >
              </div>
            </div>
            <HandoffSecretField
              :profile-id="customer.handoffProfile.profileId"
              :masked="customer.handoffProfile.deploymentChecklistMasked"
            />
          </section>

          <section class="handoff-section feature-section">
            <div class="section-heading">
              <span>02</span>
              <div>
                <small>FEATURE FOOTPRINT</small>
                <h3>功能使用情况</h3>
              </div>
            </div>
            <div class="chip-list teal">
              <span
                v-for="feature in customer.handoffProfile.featureUsage"
                :key="feature"
                >{{ feature }}</span
              ><em v-if="!customer.handoffProfile.featureUsage.length"
                >未填写</em
              >
            </div>
            <div class="field-block">
              <label>定制功能</label>
              <p>
                <SafeRichText :value="customer.handoffProfile.customFeatures" />
              </p>
            </div>
          </section>

          <section class="handoff-section telemetry-section full-span">
            <div class="section-heading">
              <span>03</span>
              <div>
                <small>OBSERVABILITY FOOTPRINT</small>
                <h3>日志 / APM / RUM</h3>
              </div>
            </div>
            <div class="telemetry-grid">
              <article>
                <b>LOG</b><strong>日志采集</strong>
                <div class="chip-list">
                  <span
                    v-for="item in customer.handoffProfile.logCollection"
                    :key="item"
                    >{{ item }}</span
                  ><em v-if="!customer.handoffProfile.logCollection.length"
                    >未填写</em
                  >
                </div>
                <p>
                  <SafeRichText
                    :value="customer.handoffProfile.logCollectionNotes"
                  />
                </p>
              </article>
              <article>
                <b>APM</b><strong>探针</strong>
                <div class="chip-list">
                  <span
                    v-for="item in customer.handoffProfile.apmProbes"
                    :key="item"
                    >{{ item }}</span
                  ><em v-if="!customer.handoffProfile.apmProbes.length"
                    >未填写</em
                  >
                </div>
                <p>
                  <SafeRichText :value="customer.handoffProfile.apmNotes" />
                </p>
              </article>
              <article>
                <b>RUM</b><strong>应用</strong>
                <div class="chip-list">
                  <span
                    v-for="item in customer.handoffProfile.rumApps"
                    :key="item"
                    >{{ item }}</span
                  ><em v-if="!customer.handoffProfile.rumApps.length"
                    >未填写</em
                  >
                </div>
                <p>
                  <SafeRichText :value="customer.handoffProfile.rumNotes" />
                </p>
              </article>
            </div>
          </section>

          <section class="handoff-section issue-section">
            <div class="section-heading">
              <span>04</span>
              <div>
                <small>HISTORY</small>
                <h3>历史重要问题</h3>
              </div>
            </div>
            <p class="long-copy">
              <SafeRichText :value="customer.handoffProfile.importantIssues" />
            </p>
          </section>

          <section
            :class="[
              'handoff-section',
              'issue-section',
              { attention: customer.handoffProfile.legacyIssues },
            ]"
          >
            <div class="section-heading">
              <span>05</span>
              <div>
                <small>LEGACY QUEUE</small>
                <h3>遗留问题</h3>
              </div>
            </div>
            <p class="long-copy">
              <SafeRichText :value="customer.handoffProfile.legacyIssues" />
            </p>
          </section>

          <section class="handoff-section contact-section full-span">
            <div class="section-heading">
              <span>06</span>
              <div>
                <small>COMMUNICATION</small>
                <h3>沟通与联系人</h3>
              </div>
            </div>
            <div>
              <label>沟通渠道</label>
              <p>
                <SafeRichText
                  :value="customer.handoffProfile.communicationChannel"
                />
              </p>
            </div>
            <div>
              <label>联系人信息</label>
              <p>
                <SafeRichText :value="customer.handoffProfile.contactInfo" />
              </p>
            </div>
          </section>
        </div>
      </article>

      <article v-else class="panel no-handoff">
        <span>⌁</span>
        <div>
          <small>HANDOFF PENDING</small>
          <h2>该客户尚未关联飞书交接档案</h2>
          <p>同步或人工关联后，部署、功能使用和历史问题会显示在这里。</p>
        </div>
      </article>

      <div class="customer-service-kpis">
        <article>
          <span>2026 服务记录</span
          ><strong>{{ customer.service2026.total }}</strong
          ><small>飞书只读镜像</small>
        </article>
        <article class="attention">
          <span>当前未闭环</span><strong>{{ customer.service2026.open }}</strong
          ><small>待回复、跟进中或已升级</small>
        </article>
        <article>
          <span>最近服务日期</span
          ><strong>{{ shortDate(customer.service2026.lastServiceAt) }}</strong
          ><small>按开始日期</small>
        </article>
        <article>
          <span>负责人</span
          ><strong>{{ customer.owner?.name || "未分配" }}</strong
          ><small>{{ customer.owner?.email || "客户中心可继续维护" }}</small>
        </article>
      </div>
      <div class="customer-insight-grid">
        <article class="panel">
          <header>
            <div>
              <small>MONTHLY SERVICE LOAD</small>
              <h2>月度服务趋势</h2>
            </div>
            <span>2026</span>
          </header>
          <div
            v-if="customer.service2026.monthlyTrend.length"
            class="customer-month-chart"
          >
            <div
              v-for="item in customer.service2026.monthlyTrend"
              :key="item.month"
            >
              <i
                :style="{
                  height: `${Math.max((item.count / maxMonth) * 150, 4)}px`,
                }"
              ></i
              ><strong>{{ item.count }}</strong
              ><span>{{ item.month.slice(5) }}月</span>
            </div>
          </div>
          <div v-else class="quiet-state"><strong>暂无服务趋势</strong></div>
        </article>
        <article class="panel">
          <header>
            <div>
              <small>FREQUENT ISSUE TYPES</small>
              <h2>高频问题类型</h2>
            </div>
          </header>
          <div
            v-if="customer.service2026.topIssueTypes.length"
            class="customer-issues"
          >
            <div
              v-for="item in customer.service2026.topIssueTypes"
              :key="item.issueType"
            >
              <span>{{ item.issueType }}</span
              ><i
                ><b
                  :style="{
                    width: `${(item.count / customer.service2026.topIssueTypes[0].count) * 100}%`,
                  }"
                ></b></i
              ><strong>{{ item.count }}</strong>
            </div>
          </div>
          <div v-else class="quiet-state"><strong>暂无问题分类</strong></div>
        </article>
      </div>
      <article class="panel customer-recent-records">
        <header>
          <div>
            <small>LATEST SERVICE RECORDS</small>
            <h2>最近服务记录</h2>
          </div>
          <RouterLink :to="`/service-records?customerId=${customer.id}`"
            >查看全部 →</RouterLink
          >
        </header>
        <div v-if="records.length" class="customer-record-list">
          <RouterLink
            v-for="record in records"
            :key="record.id"
            :to="`/service-records?keyword=${encodeURIComponent(record.serviceRecordNo || record.externalRecordId)}`"
            ><span
              ><strong>{{ shortDate(record.startDate) }}</strong
              ><small
                >#{{ record.serviceRecordNo || record.externalRecordId }}</small
              ></span
            ><span
              ><strong>{{ record.summary || "未填写反馈内容" }}</strong
              ><small
                >{{ record.issueTypeNormalized || "未分类" }} ·
                {{ record.firstLineEngineer || "未填写工程师" }}</small
              ></span
            ><b :data-status="record.normalizedStatus">{{
              statusLabels[record.normalizedStatus]
            }}</b></RouterLink
          >
        </div>
        <div v-else class="quiet-state">
          <strong>该客户暂无 2026 服务记录</strong>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.customer-identity {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 25px 27px;
  border-radius: 16px;
  background: linear-gradient(110deg, #10253b, #193e50);
  color: #fff;
}
.customer-identity > div:first-child > a,
.customer-identity span {
  display: block;
  color: #8fe0d3;
  font-size: 9px;
}
.customer-identity span {
  margin-top: 18px;
  font:
    650 9px ui-monospace,
    monospace;
  letter-spacing: 0.16em;
}
.customer-identity h2 {
  font-size: 28px;
  margin: 8px 0 5px;
}
.customer-identity p {
  margin: 0;
  color: #adbec7;
  font-size: 11px;
}
.customer-identity > div:last-child {
  display: flex;
  gap: 8px;
}
.customer-identity > div:last-child a {
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  color: #d9e4e8;
  font-size: 10px;
}
.customer-identity > div:last-child a.primary {
  border-color: #159786;
  background: #159786;
  color: #fff;
}
.handoff-profile-panel {
  padding-bottom: 20px;
}
.handoff-freshness {
  text-align: right;
}
.handoff-freshness strong,
.handoff-freshness span {
  display: block;
}
.handoff-freshness strong {
  color: #087c6c;
  font-size: 11px;
}
.handoff-freshness span {
  margin-top: 5px;
  color: var(--muted);
  font-size: 9px;
}
.handoff-overview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-bottom: 16px;
  border: 1px solid #dbe7e6;
  border-radius: 11px;
  background: #f5faf9;
  overflow: hidden;
}
.handoff-overview > div {
  padding: 13px 15px;
  border-right: 1px solid #dbe7e6;
}
.handoff-overview > div:last-child {
  border: 0;
}
.handoff-overview span,
.handoff-overview strong {
  display: block;
}
.handoff-overview span {
  color: var(--muted);
  font-size: 9px;
}
.handoff-overview strong {
  margin-top: 7px;
  font:
    650 11px ui-monospace,
    monospace;
}
.handoff-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
}
.handoff-section {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}
.full-span {
  grid-column: 1/-1;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}
.section-heading > span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e1f3ef;
  color: #087c6c;
  font:
    700 9px ui-monospace,
    monospace;
}
.section-heading small {
  color: var(--teal);
  font:
    650 8px ui-monospace,
    monospace;
  letter-spacing: 0.13em;
}
.section-heading h3 {
  margin: 3px 0 0;
  font-size: 13px;
}
.field-block + .protected-field {
  margin-top: 12px;
}
.field-block label,
.contact-section label {
  display: block;
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 9px;
}
.field-block p,
.contact-section p,
.long-copy,
.telemetry-grid p {
  margin: 0;
  color: #536875;
  font-size: 10px;
  line-height: 1.75;
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip-list span,
.chip-list em {
  padding: 5px 8px;
  border-radius: 12px;
  background: #edf2f3;
  color: #536875;
  font-size: 9px;
  font-style: normal;
}
.chip-list.teal span {
  background: #dff4ef;
  color: #087c6c;
}
.feature-section > .field-block {
  margin-top: 17px;
  padding-top: 14px;
  border-top: 1px solid #edf1f2;
}
.telemetry-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.telemetry-grid article {
  min-width: 0;
  padding: 13px;
  border-radius: 10px;
  background: #f6f9fa;
}
.telemetry-grid b {
  display: inline-block;
  padding: 3px 5px;
  border-radius: 4px;
  background: #10253b;
  color: #8fe0d3;
  font:
    700 8px ui-monospace,
    monospace;
}
.telemetry-grid strong {
  display: block;
  margin: 8px 0 10px;
  font-size: 11px;
}
.telemetry-grid p {
  margin-top: 11px;
}
.issue-section.attention {
  border-color: #efc8c2;
  background: #fffafa;
}
.issue-section.attention .section-heading > span {
  background: #fde9e7;
  color: #d65d57;
}
.contact-section {
  display: grid;
  grid-template-columns: auto 1fr 1fr;
  align-items: start;
  gap: 18px;
}
.contact-section .section-heading {
  margin: 0;
}
.contact-section > div:not(.section-heading) {
  padding-left: 18px;
  border-left: 1px solid #edf1f2;
}
.no-handoff {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 120px;
}
.no-handoff > span {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--amber-soft);
  color: #aa6b17;
}
.no-handoff small {
  color: #aa6b17;
  font:
    650 8px ui-monospace,
    monospace;
  letter-spacing: 0.13em;
}
.no-handoff h2 {
  margin: 5px 0;
  font-size: 14px;
}
.no-handoff p {
  margin: 0;
  color: var(--muted);
  font-size: 10px;
}
.customer-service-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid #dfe7e9;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}
.customer-service-kpis article {
  padding: 18px;
  border-right: 1px solid #dfe7e9;
  position: relative;
}
.customer-service-kpis article:last-child {
  border: 0;
}
.customer-service-kpis article.attention:after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 3px;
  background: #e59a32;
}
.customer-service-kpis span,
.customer-service-kpis small {
  display: block;
  color: #70808d;
  font-size: 9px;
}
.customer-service-kpis strong {
  display: block;
  margin: 13px 0 8px;
  font:
    700 22px ui-monospace,
    monospace;
}
.customer-insight-grid {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 18px;
}
.customer-month-chart {
  height: 210px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  border-bottom: 1px solid #dfe7e9;
  padding: 0 10px;
}
.customer-month-chart > div {
  flex: 1;
  display: flex;
  align-items: center;
  flex-direction: column;
}
.customer-month-chart i {
  display: block;
  width: min(28px, 70%);
  border-radius: 5px 5px 0 0;
  background: linear-gradient(#159786, #83d0c5);
}
.customer-month-chart strong {
  font:
    650 9px ui-monospace,
    monospace;
  margin-top: 5px;
}
.customer-month-chart span {
  color: #70808d;
  font-size: 8px;
  margin: 3px 0 7px;
}
.customer-issues {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.customer-issues > div {
  display: grid;
  grid-template-columns: 110px 1fr 30px;
  gap: 10px;
  align-items: center;
  font-size: 10px;
}
.customer-issues i {
  height: 7px;
  border-radius: 5px;
  background: #edf1f2;
  overflow: hidden;
}
.customer-issues b {
  display: block;
  height: 100%;
  border-radius: 5px;
  background: #5c8fa9;
}
.customer-issues strong {
  font:
    650 10px ui-monospace,
    monospace;
  text-align: right;
}
.customer-record-list {
  display: flex;
  flex-direction: column;
}
.customer-record-list > a {
  display: grid;
  grid-template-columns: 110px 1fr 90px;
  gap: 15px;
  align-items: center;
  padding: 12px 8px;
  border-bottom: 1px solid #edf1f2;
}
.customer-record-list span strong,
.customer-record-list span small {
  display: block;
}
.customer-record-list span strong {
  font-size: 10px;
}
.customer-record-list span small {
  margin-top: 4px;
  color: #70808d;
  font-size: 9px;
}
.customer-record-list b {
  width: max-content;
  padding: 5px 8px;
  border-radius: 12px;
  background: #dff4ef;
  color: #087c6c;
  font-size: 9px;
}
.customer-record-list b[data-status="WAITING_REPLY"] {
  background: #fde9e7;
  color: #d65d57;
}
.customer-record-list b[data-status="IN_PROGRESS"] {
  background: #fff0d6;
  color: #aa6b17;
}
.customer-record-list b[data-status="ESCALATED"] {
  background: #eeeaf6;
  color: #725f9c;
}
@media (max-width: 850px) {
  .customer-identity {
    align-items: flex-start;
    flex-direction: column;
    gap: 20px;
  }
  .handoff-overview {
    grid-template-columns: 1fr 1fr;
  }
  .handoff-overview > div:nth-child(2) {
    border-right: 0;
  }
  .handoff-overview > div:nth-child(-n + 2) {
    border-bottom: 1px solid #dbe7e6;
  }
  .handoff-grid,
  .telemetry-grid {
    grid-template-columns: 1fr;
  }
  .full-span {
    grid-column: auto;
  }
  .contact-section {
    grid-template-columns: 1fr;
  }
  .contact-section > div:not(.section-heading) {
    padding: 12px 0 0;
    border-left: 0;
    border-top: 1px solid #edf1f2;
  }
  .customer-service-kpis {
    grid-template-columns: 1fr 1fr;
  }
  .customer-service-kpis article:nth-child(2) {
    border-right: 0;
  }
  .customer-service-kpis article:nth-child(-n + 2) {
    border-bottom: 1px solid #dfe7e9;
  }
  .customer-insight-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .customer-identity > div:last-child {
    width: 100%;
    flex-direction: column;
  }
  .customer-identity > div:last-child a {
    text-align: center;
  }
  .customer-record-list > a {
    grid-template-columns: 85px 1fr;
  }
  .customer-record-list b {
    grid-column: 2;
  }
}
</style>
