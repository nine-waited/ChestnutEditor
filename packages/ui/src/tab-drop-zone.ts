import type { PaneId } from "@chestnut/core";
import {
  capturePendingTabFlipForPane,
  clearRememberedTabDropLayout,
} from "./tab-reorder-motion.js";

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

export type TabInsertIndicator = {
  paneId: PaneId;
  insertBeforeId: string | null;
  excludeLeafId?: string | null;
  incomingPath?: string | null;
} | null;

let tabInsertIndicator: TabInsertIndicator = null;
const tabInsertListeners = new Set<() => void>();

function tabInsertIndicatorEquals(a: TabInsertIndicator, b: TabInsertIndicator): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.paneId === b.paneId &&
    a.insertBeforeId === b.insertBeforeId &&
    (a.excludeLeafId ?? null) === (b.excludeLeafId ?? null) &&
    (a.incomingPath ?? null) === (b.incomingPath ?? null)
  );
}

export function getTabInsertIndicator(): TabInsertIndicator {
  return tabInsertIndicator;
}

export function subscribeTabInsertIndicator(listener: () => void): () => void {
  tabInsertListeners.add(listener);
  return () => {
    tabInsertListeners.delete(listener);
  };
}

export function setTabInsertIndicator(next: TabInsertIndicator): void {
  if (tabInsertIndicatorEquals(tabInsertIndicator, next)) return;
  tabInsertIndicator = next;
  for (const listener of tabInsertListeners) listener();
}

export function clearTabDragFeedback(): void {
  if (tabInsertIndicator) capturePendingTabFlipForPane(tabInsertIndicator.paneId);
  setTabDropTarget(null);
  setSplitDropHint(false);
  setTabInsertIndicator(null);
  clearRememberedTabDropLayout();
}

const TAB_REORDER_Y_PAD = 10;

export function isPointOverTabStrip(clientX: number, clientY: number, paneId: PaneId): boolean {
  const strip = document.querySelector(`.boke-tabs[data-pane="${paneId}"]`);
  if (!(strip instanceof HTMLElement)) return false;
  const rect = strip.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top - TAB_REORDER_Y_PAD &&
    clientY <= rect.bottom + TAB_REORDER_Y_PAD
  );
}

/**
 * Tab-bar insert target. `insertBeforeId` null = move/open at the end.
 * `excludeLeafId` skips the tab being dragged (or the already-open file).
 */
export function findTabReorderTarget(
  clientX: number,
  clientY: number,
  paneId: PaneId,
  excludeLeafId?: string | null,
): { insertBeforeId: string | null } | null {
  if (!isPointOverTabStrip(clientX, clientY, paneId)) return null;
  const strip = document.querySelector(`.boke-tabs[data-pane="${paneId}"]`);
  if (!(strip instanceof HTMLElement)) return null;

  const others = Array.from(strip.querySelectorAll<HTMLElement>(".boke-tab[data-leaf-id]")).filter(
    (tab) => tab.getAttribute("data-leaf-id") !== (excludeLeafId ?? ""),
  );
  if (others.length === 0) return { insertBeforeId: null };

  for (const tab of others) {
    const id = tab.getAttribute("data-leaf-id");
    if (!id) continue;
    const tabRect = tab.getBoundingClientRect();
    if (clientX < tabRect.left + tabRect.width / 2) {
      return { insertBeforeId: id };
    }
  }
  return { insertBeforeId: null };
}
