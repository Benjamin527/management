import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HandoffSecretField from "../HandoffSecretField.vue";

const { revealHandoffSecret } = vi.hoisted(() => ({
  revealHandoffSecret: vi.fn(),
}));
vi.mock("../../../api/handoffProfiles", () => ({ revealHandoffSecret }));
vi.mock("../../../stores/auth", () => ({
  useAuthStore: () => ({
    user: { id: "admin-1", role: "ADMIN", name: "管理员" },
  }),
}));

describe("HandoffSecretField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revealHandoffSecret.mockResolvedValue({
      field: "deploymentChecklist",
      value: "root / QWert-should-not-cache",
    });
  });

  it("reveals the protected deployment checklist only after an admin action and clears it again", async () => {
    const wrapper = mount(HandoffSecretField, {
      props: { profileId: "profile-1", masked: "包含受保护的部署信息" },
    });

    expect(wrapper.text()).toContain("包含受保护的部署信息");
    expect(wrapper.text()).not.toContain("QWert-should-not-cache");

    await wrapper.get('[data-action="reveal-handoff-secret"]').trigger("click");
    await flushPromises();

    expect(revealHandoffSecret).toHaveBeenCalledWith(
      "profile-1",
      "deploymentChecklist",
    );
    expect(wrapper.get("[data-secret-value]").text()).toContain(
      "QWert-should-not-cache",
    );

    await wrapper.get('[data-action="hide-handoff-secret"]').trigger("click");
    expect(wrapper.text()).not.toContain("QWert-should-not-cache");
  });
});
