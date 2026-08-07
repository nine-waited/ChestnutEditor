import type { PaneId } from "@chestnut/core";

/** Right fraction of the editor area that triggers enter-split when dropping. */
export const SPLIT_DROP_ZONE_RATIO = 0.28;

/** Prefer the tab bar; fall back to the editor pane host. */
export function findDropPaneId(clientX: number, clientY: number): PaneId | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof Element)) return null;
  const host = el.closest<HTMLElement>(".boke-tabs[data-pane], .boke-editor-pane[data-pane]");
  const id = host?.getAttribute("data-pane");
  if (id === "left" || id === "right") return id;
  return null;
}

/** True when the pointer is over a tab strip (not the broader editor pane). */
export function findDropTabPaneId(clientX: number, clientY: number): PaneId | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof Element)) return null;
  const host = el.closest<HTMLElement>(".boke-tabs[data-pane]");
  const id = host?.getAttribute("data-pane");
  if (id === "left" || id === "right") return id;
  return null;
}

export function isInSplitDropZone(clientX: number, clientY: number): boolean {
  const area = document.querySelector(".boke-editor-area");
  if (!(area instanceof HTMLElement)) return false;
  const rect = area.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return false;
  }
  return clientX >= rect.right - rect.width * SPLIT_DROP_ZONE_RATIO;
}

export function setTabDropTarget(paneId: PaneId | null): void {
  document.querySelectorAll(".boke-editor-pane.is-tab-drop-target").forEach((node) => {
    node.classList.remove("is-tab-drop-target");
  });
  document.querySelectorAll(".boke-tabs.is-file-drop-target").forEach((node) => {
    node.classList.remove("is-file-drop-target");
  });
  if (!paneId) return;
  document
    .querySelector(`.boke-editor-pane[data-pane="${paneId}"]`)
    ?.classList.add("is-tab-drop-target");
  document
    .querySelector(`.boke-tabs[data-pane="${paneId}"]`)
    ?.classList.add("is-file-drop-target");
}

export function setSplitDropHint(active: boolean, label = ""): void {
  const area = document.querySelector(".boke-editor-area");
  if (!(area instanceof HTMLElement)) return;
  let hint = area.querySelector(".boke-split-drop-hint");
  if (!active) {
    area.classList.remove("is-split-drop-hint");
    hint?.remove();
    return;
  }
  area.classList.add("is-split-drop-hint");
  if (!(hint instanceof HTMLElement)) {
    hint = document.createElement("div");
    hint.className = "boke-split-drop-hint";
    hint.setAttribute("aria-live", "polite");
    area.appendChild(hint);
  }
  hint.textContent = label;
}

export function clearTabDragFeedback(): void {
  setTabDropTarget(null);
  setSplitDropHint(false);
}
