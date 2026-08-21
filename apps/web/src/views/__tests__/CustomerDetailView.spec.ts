import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerDetailView from "../CustomerDetailView.vue";

const { getCustomer, listServiceRecords } = vi.hoisted(() => ({
  getCustomer: vi.fn(),
  listServiceRecords: vi.fn(),
}));
vi.mock("../../api/customers", () => ({ getCustomer }));
vi.mock("../../api/serviceRecords", () => ({ listServiceRecords }));

describe("CustomerDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCustomer.mockResolvedValue({
      id: "c1",
      name: "太保",
      industry: "保险",
      level: "A",
      status: "ACTIVE",
      owner: { id: "u1", name: "王雨轩", email: "owner@example.com" },
      handoffProfile: {
        profileId: "profile-1",
        externalRecordId: "rec-1",
        deploymentType: "SAAS",
        deploymentChecklistMasked: "包含受保护的部署信息",
        saasSites: ["杭州站点", "https://example.com/site"],
        featureUsage: ["日志", "APM"],
        logCollection: ["Kubernetes 标准输出"],
        logCollectionNotes: "采集入口 https://example.com/logs",
        apmProbes: ["ddtrace"],
        apmNotes: null,
        rumApps: ["Web"],
        rumNotes: "生产环境 Web 应用",
        customFeatures: "批量任务",
        handoffPeople: ["苏桐桐"],
        handoffAt: "2026-04-14T00:00:00.000Z",
        handoffStatus: "审核通过",
        importantIssues: "历史重要问题",
        legacyIssues: "仍需跟进告警策略",
        communicationChannel: "微信群",
        contactInfo: "廖老师",
        sourceUpdatedAt: "2026-08-20T00:00:00.000Z",
        syncedAt: "2026-08-21T00:00:00.000Z",
      },
      service2026: {
        total: 18,
        open: 3,
        lastServiceAt: "2026-08-19T03:20:00.000Z",
        monthlyTrend: [
          { month: "2026-07", count: 6 },
          { month: "2026-08", count: 12 },
        ],
        topIssueTypes: [{ issueType: "监控问题", count: 8 }],
      },
    });
    listServiceRecords.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 5,
      total: 18,
    });
  });

  it("shows customer service KPIs, trend and high-frequency issues", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/customers/:id", component: CustomerDetailView }],
    });
    await router.push("/customers/c1");
    const wrapper = mount(CustomerDetailView, {
      global: {
        plugins: [router],
        stubs: { RouterLink: { template: "<a><slot /></a>" } },
      },
    });
    await flushPromises();

    expect(getCustomer).toHaveBeenCalledWith("c1");
    expect(listServiceRecords).toHaveBeenCalledWith({
      customerId: "c1",
      page: 1,
      pageSize: 5,
    });
    expect(wrapper.text()).toContain("2026 服务记录");
    expect(wrapper.text()).toContain("监控问题");
    expect(wrapper.text()).toContain("18");
    expect(wrapper.text()).toContain("部署与站点");
    expect(wrapper.text()).toContain("功能使用情况");
    expect(wrapper.text()).toContain("日志 / APM / RUM");
    expect(wrapper.text()).toContain("历史重要问题");
    expect(wrapper.text()).toContain("仍需跟进告警策略");
    expect(wrapper.text()).toContain("微信群");
    expect(
      wrapper.get('a[href="https://example.com/site"]').attributes("rel"),
    ).toContain("noreferrer");
    expect(wrapper.text()).not.toContain("rawFieldsMasked");
  });
});
