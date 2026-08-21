import { nextTick, onBeforeUnmount, watch, type Ref } from "vue";

type Layer = { id: symbol; close: () => void };

const layers: Layer[] = [];
let previousOverflow = "";

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  layers.at(-1)?.close();
}

function acquire(layer: Layer) {
  if (!layers.length) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("overlay-open");
    window.addEventListener("keydown", handleKeydown);
  }
  layers.push(layer);
}

function release(id: symbol) {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index === -1) return false;
  layers.splice(index, 1);
  if (!layers.length) {
    document.body.style.overflow = previousOverflow;
    document.body.classList.remove("overlay-open");
    window.removeEventListener("keydown", handleKeydown);
  }
  return true;
}

export function useOverlayLayer(open: Ref<boolean>, close: () => void) {
  const id = Symbol("overlay-layer");
  let restoreTarget: HTMLElement | null = null;

  const stop = watch(
    open,
    (value) => {
      if (value) {
        if (layers.some((layer) => layer.id === id)) return;
        restoreTarget =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        acquire({ id, close });
        return;
      }
      if (release(id)) {
        const target = restoreTarget;
        restoreTarget = null;
        void nextTick(() => target?.focus());
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stop();
    release(id);
    restoreTarget = null;
  });
}
