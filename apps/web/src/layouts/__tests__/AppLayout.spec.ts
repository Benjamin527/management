import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "../AppLayout.vue";

vi.mock("../../stores/auth", () => ({
  useAuthStore: () => ({
    user: { name: "王雨轩", role: "ADMIN" },
    logout: vi.fn(),
  }),
}));

describe("AppLayout", () => {
  it("exposes stable viewport regions and renders the current Shanghai date", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/customers",
          component: {
            template: '<section class="page-stack">customers</section>',
          },
        },
      ],
    });
    await router.push("/customers");
    const wrapper = mount(AppLayout, { global: { plugins: [router] } });

    expect(wrapper.get("main").classes()).toContain("app-main");
    expect(wrapper.get("header").classes()).toContain("app-topbar");
    expect(wrapper.get(".date-chip").text()).toMatch(/^\d{4} · \d{2} · \d{2}$/);
    expect(wrapper.get(".date-chip").text()).not.toBe("2026 · 08 · 20");
  });
});
