import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../src/stores/auth";
import ConsumptionView from "../src/views/ConsumptionView.vue";

const { getConsumptionAnalysis, getConsumptionSyncStatus, runConsumptionSync } =
  vi.hoisted(() => ({
    getConsumptionAnalysis: vi.fn(),
    getConsumptionSyncStatus: vi.fn(),
    runConsumptionSync: vi.fn(),
  }));

vi.mock("../src/api/consumption", () => ({
  getConsumptionAnalysis,
  getConsumptionSyncStatus,
  runConsumptionSync,
}));

const dates = Array.from(
  { length: 14 },
  (_, index) => `2026-08-${String(index + 7).padStart(2, "0")}`,
);
const emptyAnalysis = {
  periodDays: 14 as const,
  source: "ALL" as const,
  range: { from: "2026-08-07", to: "2026-08-20" },
  dataThrough: "2026-08-20",
  lastSyncedAt: "2026-08-20T05:00:00.000Z",
  unit: "CNY",
  kpis: {
    totalAmount: 0,
    recent7Amount: 0,
    previous7Amount: 0,
    changeRate: null,
    activeAccounts: 0,
    anomalyAccounts: 0,
  },
  trend: dates.map((date) => ({ date, amount: 0 })),
  coverage: dates.map((date) => ({ date, domestic: true, overseas: true })),
  availableDates: dates,
  missingDates: [] as string[],
  productDistribution: [],
  accountRanking: [],
  anomalies: [],
  filters: {
    products: ["日志"],
    accounts: [
      {
        id: "a1",
        source: "DOMESTIC" as const,
        externalId: "4096",
        displayName: "太保",
        managerName: "王雨轩",
      },
    ],
  },
};

const successStatus = {
  enabled: true,
  running: false,
  lastSuccessfulRun: {
    id: "run-1",
    status: "SUCCESS" as const,
    rangeStart: "2026-08-07",
    rangeEnd: "2026-08-20",
    readCount: 100,
    accountCount: 20,
    rowCount: 80,
    errorSummary: null,
    startedAt: "2026-08-20T05:00:00.000Z",
    finishedAt: "2026-08-20T05:00:03.000Z",
  },
  lastRun: null,
  nextScheduledAt: "2026-08-21T05:00:00.000Z",
};

function mountView(role = "ADMIN") {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = {
    id: "user-1",
    email: "user@example.com",
    name: "测试用户",
    role,
  };
  return mount(ConsumptionView);
}

describe("ConsumptionView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConsumptionAnalysis.mockResolvedValue(emptyAnalysis);
    getConsumptionSyncStatus.mockResolvedValue(successStatus);
    runConsumptionSync.mockResolvedValue({ accepted: true });
  });

  it("uses a fixed 14-day period and switches among all, domestic, and overseas", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("最近 14 天消费脉搏");
    expect(wrapper.text()).toContain("全部");
    expect(wrapper.text()).toContain("国内");
    expect(wrapper.text()).toContain("海外");
    expect(wrapper.text()).not.toContain("60 天");
    expect(getConsumptionAnalysis).toHaveBeenCalledWith({ source: "ALL" });

    await wrapper.get('[data-source="DOMESTIC"]').trigger("click");
    await flushPromises();
    expect(getConsumptionAnalysis).toHaveBeenLastCalledWith({
      source: "DOMESTIC",
    });
  });

  it("shows source completeness and distinguishes missing dates", async () => {
    getConsumptionAnalysis.mockResolvedValue({
      ...emptyAnalysis,
      missingDates: ["2026-08-12"],
      availableDates: dates.filter((date) => date !== "2026-08-12"),
      coverage: emptyAnalysis.coverage.map((day) =>
        day.date === "2026-08-12" ? { ...day, overseas: false } : day,
      ),
    });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("1 天数据未完整产出");
    expect(wrapper.get('[data-date="2026-08-12"]').classes()).toContain(
      "missing",
    );
  });

  it("lets an admin start a real synchronization", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.get('[data-action="sync-consumption"]').trigger("click");
    await flushPromises();
    expect(runConsumptionSync).toHaveBeenCalledTimes(1);
  });

  it("disables manual synchronization for an agent and explains why", async () => {
    const wrapper = mountView("AGENT");
    await flushPromises();

    const button = wrapper.get('[data-action="sync-consumption"]');
    expect(button.attributes()).toHaveProperty("disabled");
    expect(wrapper.text()).toContain("仅管理员和经理可手动同步");
  });

  it("shows a directed empty state", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("最近 14 天还没有消费数据");
  });

  it("shows a recoverable request error", async () => {
    getConsumptionAnalysis.mockRejectedValueOnce(new Error("网络异常"));
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("消费数据加载失败");
    expect(wrapper.find('[data-action="retry"]').exists()).toBe(true);
  });
});
