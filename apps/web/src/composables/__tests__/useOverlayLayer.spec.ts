import { defineComponent, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { useOverlayLayer } from "../useOverlayLayer";

const Harness = defineComponent({
  setup() {
    const open = ref(false);
    useOverlayLayer(open, () => {
      open.value = false;
    });
    return { open };
  },
  template:
    '<button data-trigger @click="open = true">open</button><div v-if="open" data-layer>layer</div>',
});

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.classList.remove("overlay-open");
  document.body.style.overflow = "";
  document.body.innerHTML = "";
});

function mountHarness() {
  const wrapper = mount(Harness, { attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

describe("useOverlayLayer", () => {
  it("locks the body, closes on Escape and restores focus", async () => {
    const wrapper = mountHarness();
    const trigger = wrapper.get<HTMLButtonElement>("[data-trigger]");
    trigger.element.focus();
    await trigger.trigger("click");

    expect(document.body.classList.contains("overlay-open")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();

    expect(wrapper.find("[data-layer]").exists()).toBe(false);
    expect(document.body.classList.contains("overlay-open")).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
  });

  it("keeps the body locked until the final overlay closes", async () => {
    const first = mountHarness();
    const second = mountHarness();
    await first.get("[data-trigger]").trigger("click");
    await second.get("[data-trigger]").trigger("click");

    first.vm.open = false;
    await nextTick();
    expect(document.body.classList.contains("overlay-open")).toBe(true);

    second.vm.open = false;
    await nextTick();
    expect(document.body.classList.contains("overlay-open")).toBe(false);
  });
});
