import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomer, listCustomers } from "../src/api/customers";
import {
  getConsumptionAnalysis,
  getConsumptionSyncStatus,
  runConsumptionSync,
} from "../src/api/consumption";
import { createIssue, listIssues } from "../src/api/issues";

describe("typed data layer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
  });

  it("builds customer list filters and create payloads", async () => {
    await listCustomers({ keyword: "太保", pageSize: 50 });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/customers?keyword=%E5%A4%AA%E4%BF%9D&pageSize=50",
      expect.any(Object),
    );

    await createCustomer({
      name: "新客户",
      industry: "保险",
      status: "ACTIVE",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/customers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "新客户",
          industry: "保险",
          status: "ACTIVE",
        }),
      }),
    );
  });

  it("uses only independent consumption filters and exposes synchronization actions", async () => {
    await getConsumptionAnalysis({
      period: 7,
      source: "OVERSEAS",
      accountId: "a1",
      product: "日志",
      managerName: "王雨轩",
      anomalyStatus: "RISE",
      direction: "UP",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/consumption/analysis?period=7&source=OVERSEAS&accountId=a1&product=%E6%97%A5%E5%BF%97&managerName=%E7%8E%8B%E9%9B%A8%E8%BD%A9&anomalyStatus=RISE&direction=UP",
      expect.any(Object),
    );

    await getConsumptionSyncStatus();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/consumption/sync/status",
      expect.any(Object),
    );

    await runConsumptionSync();
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/consumption/sync/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("lists and creates service issues", async () => {
    await listIssues({ status: "PENDING", keyword: "告警" });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/issues?status=PENDING&keyword=%E5%91%8A%E8%AD%A6",
      expect.any(Object),
    );

    const input = {
      serviceNo: "5001",
      customerId: "c1",
      title: "告警未送达",
      description: "客户反馈未收到告警",
      channel: "FEISHU" as const,
      priority: "HIGH" as const,
    };
    await createIssue(input);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/issues",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });
});
