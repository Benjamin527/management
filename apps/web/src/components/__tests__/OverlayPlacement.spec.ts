import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import AppToast from "../AppToast.vue";
import CustomerDialog from "../CustomerDialog.vue";
import CustomerImportDialog from "../CustomerImportDialog.vue";
import HandoffUnmatchedDialog from "../customer/HandoffUnmatchedDialog.vue";
import IssueDialog from "../IssueDialog.vue";
import ServiceRecordDrawer from "../service/ServiceRecordDrawer.vue";

vi.mock("../../api/customers", () => ({
  createCustomer: vi.fn(),
  listCustomers: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("../../api/issues", () => ({ createIssue: vi.fn() }));
vi.mock("../../api/handoffProfiles", () => ({
  listUnmatchedHandoffProfiles: vi.fn().mockResolvedValue([]),
  linkHandoffProfile: vi.fn(),
}));

const wrappers: VueWrapper[] = [];
function mounted(
  component: Parameters<typeof mount>[0],
  props: Record<string, unknown>,
) {
  const wrapper = mount(component, {
    attachTo: document.body,
    props,
    global: { stubs: { transition: false } },
  }) as VueWrapper;
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
});

describe("overlay placement", () => {
  it.each([
    ["new customer", CustomerDialog, { open: true }, ".dialog-backdrop"],
    [
      "customer import",
      CustomerImportDialog,
      { open: true },
      ".dialog-backdrop",
    ],
    ["service issue", IssueDialog, { open: true }, ".dialog-backdrop"],
    [
      "unmatched handoff",
      HandoffUnmatchedDialog,
      { open: true, customers: [] },
      ".dialog-backdrop",
    ],
    [
      "service record drawer",
      ServiceRecordDrawer,
      { open: true, loading: false, error: "", record: null },
      ".record-drawer-backdrop",
    ],
    ["toast", AppToast, { message: "已保存", tone: "success" }, ".app-toast"],
  ])("teleports %s to the body", async (_name, component, props, selector) => {
    const wrapper = mounted(component, props);
    await nextTick();
    expect(wrapper.find(selector).exists()).toBe(false);
    expect(document.body.querySelector(`:scope > ${selector}`)).not.toBeNull();
  });
});
