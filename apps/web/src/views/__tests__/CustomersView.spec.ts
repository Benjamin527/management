import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomersView from "../CustomersView.vue";

const {
  listCustomers,
  getHandoffSyncStatus,
  runHandoffSync,
  listUnmatchedHandoffProfiles,
  linkHandoffProfile,
} = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  getHandoffSyncStatus: vi.fn(),
  runHandoffSync: vi.fn(),
  listUnmatchedHandoffProfiles: vi.fn(),
  linkHandoffProfile: vi.fn(),
}));

vi.mock("../../api/customers", () => ({ listCustomers }));
vi.mock("../../api/handoffProfiles", () => ({
  getHandoffSyncStatus,
  runHandoffSync,
  listUnmatchedHandoffProfiles,
  linkHandoffProfile,
}));
vi.mock("../../stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: "admin-1", role: "ADMIN", name: "管理员" },
  }),
}));

const customer = {
  id: "c1",
  name: "云鲸智能",
  industry: null,
  level: null,
  status: "ACTIVE",
  owner: null,
  service2026: { total: 8, open: 1, lastServiceAt: "2026-08-20T00:00:00.000Z" },
  handoffSummary: {
    profileId: "profile-1",
    deploymentType: "SAAS",
    handoffPeople: ["苏桐桐"],
    handoffAt: "2026-04-14T00:00:00.000Z",
    handoffStatus: "审核通过",
    hasLegacyIssues: true,
    legacyIssuePreview: "仍有一个告警需求需要持续跟进",
    sourceUpdatedAt: "2026-08-20T00:00:00.000Z",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
};

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/customers", component: CustomersView },
      { path: "/customers/:id", component: { template: "<div>detail</div>" } },
    ],
  });
  await router.push("/customers");
  const wrapper = mount(CustomersView, {
    global: { plugins: [router], stubs: { teleport: true } },
  });
  await flushPromises();
  return wrapper;
}

describe("CustomersView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCustomers.mockResolvedValue({
      items: [customer],
      page: 1,
      pageSize: 100,
      total: 1,
      handoffOverview: {
        customerTotal: 96,
        handedOver: 39,
        pending: 57,
        unmatched: 2,
        legacyIssues: 7,
      },
    });
    getHandoffSyncStatus.mockResolvedValue({
      enabled: true,
      running: false,
      lastSuccessfulRun: {
        finishedAt: "2026-08-21T02:31:00.000Z",
        readCount: 39,
      },
      lastRun: null,
      nextScheduledAt: "2026-08-22T02:30:00.000+08:00",
      sourceUrl: "https://example.feishu.cn/wiki/handoff",
    });
    listUnmatchedHandoffProfiles.mockResolvedValue([
      {
        profileId: "profile-2",
        externalRecordId: "rec-2",
        customerName: "云鲸",
        deploymentType: "SAAS",
        handoffPeople: ["苏桐桐"],
        handoffAt: "2026-04-14T00:00:00.000Z",
        handoffStatus: "审核通过",
        sourceUpdatedAt: "2026-08-20T00:00:00.000Z",
      },
    ]);
    linkHandoffProfile.mockResolvedValue({
      profileId: "profile-2",
      customerId: "c1",
      linkSource: "MANUAL",
      linkedAt: "2026-08-21T00:00:00.000Z",
    });
    runHandoffSync.mockResolvedValue({ accepted: true });
  });

  it("shows the handoff pulse and enriched customer rows", async () => {
    const wrapper = await mountView();

    expect(wrapper.get('[data-metric="customer-total"]').text()).toContain(
      "96",
    );
    expect(wrapper.get('[data-metric="handed-over"]').text()).toContain("39");
    expect(wrapper.get('[data-metric="pending"]').text()).toContain("57");
    expect(wrapper.get('[data-metric="unmatched"]').text()).toContain("2");
    expect(wrapper.text()).toContain("SAAS");
    expect(wrapper.text()).toContain("苏桐桐");
    expect(wrapper.text()).toContain("仍有一个告警需求需要持续跟进");
    expect(wrapper.get(".customer-page").classes()).toContain("customer-page");
    expect(
      wrapper
        .get(".customer-book-panel")
        .find(".customer-book-heading")
        .exists(),
    ).toBe(true);
    expect(
      wrapper.get(".customer-book-scroll").find(".customer-table").exists(),
    ).toBe(true);
    expect(
      wrapper
        .get(".customer-book-scroll")
        .find(".customer-book-heading")
        .exists(),
    ).toBe(false);
  });

  it("reloads customers with handoff filters", async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-filter="handoff-state"]').setValue("HANDED_OVER");
    await flushPromises();

    expect(listCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        handoffState: "HANDED_OVER",
        pageSize: 100,
      }),
    );

    await wrapper.get('[data-filter="deployment-type"]').setValue("SaaS");
    await flushPromises();
    expect(listCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({ deploymentType: "SaaS" }),
    );
  });

  it("links an unmatched Feishu profile to an existing customer", async () => {
    const wrapper = await mountView();

    await wrapper.get('[data-action="open-unmatched"]').trigger("click");
    await flushPromises();
    expect(listUnmatchedHandoffProfiles).toHaveBeenCalledOnce();

    await wrapper.get('[data-link-customer="profile-2"]').setValue("c1");
    await wrapper.get('[data-link-profile="profile-2"]').trigger("click");
    await flushPromises();

    expect(linkHandoffProfile).toHaveBeenCalledWith("profile-2", "c1");
    expect(listCustomers).toHaveBeenCalledTimes(2);
  });
});
