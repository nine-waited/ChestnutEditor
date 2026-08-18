const TAB_FLIP_MS = 200;
const TAB_FLIP_EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";

export type TabStripLayoutItem = { id: string; offset: number; width: number };

export type VisualTabItem<T> = { type: "leaf"; leaf: T } | { type: "slot" };

let pendingFlipFirst = new Map<string, number>();
let rememberedDropLayout: { paneId: string; layout: TabStripLayoutItem[] } | null = null;
let clearPendingFlipScheduled = false;

export function snapshotTabStripLayout(strip: HTMLElement): TabStripLayoutItem[] {
  return Array.from(strip.querySelectorAll<HTMLElement>(".boke-tab[data-leaf-id]"))
    .map((tab) => {
      const id = tab.getAttribute("data-leaf-id");
      if (!id) return null;
      return { id, offset: tab.offsetLeft, width: tab.offsetWidth };
    })
    .filter((item): item is TabStripLayoutItem => item !== null);
}

/** `xInStrip` is pointer X in the strip's content coordinates (includes scrollLeft). */
export function insertBeforeIdFromLayout(
  xInStrip: number,
  layout: readonly TabStripLayoutItem[],
  excludeLeafId: string,
): string | null {
  for (const tab of layout) {
    if (tab.id === excludeLeafId) continue;
    if (xInStrip < tab.offset + tab.width / 2) return tab.id;
  }
  return null;
}

export function findTabInsertBeforeFromLayout(
  clientX: number,
  strip: HTMLElement,
  layout: readonly TabStripLayoutItem[],
  excludeLeafId: string,
): { insertBeforeId: string | null } {
  const xInStrip = clientX - strip.getBoundingClientRect().left + strip.scrollLeft;
  return { insertBeforeId: insertBeforeIdFromLayout(xInStrip, layout, excludeLeafId) };
}

export function rememberTabDropLayout(paneId: string, strip: HTMLElement | null): TabStripLayoutItem[] {
  if (rememberedDropLayout?.paneId === paneId) return rememberedDropLayout.layout;
  const layout = strip ? snapshotTabStripLayout(strip) : [];
  rememberedDropLayout = { paneId, layout };
  return layout;
}

export function clearRememberedTabDropLayout(): void {
  rememberedDropLayout = null;
}

export function captureTabStripLefts(strip: HTMLElement): Map<string, number> {
  const lefts = new Map<string, number>();
  for (const tab of strip.querySelectorAll<HTMLElement>(".boke-tab[data-leaf-id]")) {
    const id = tab.getAttribute("data-leaf-id");
    if (!id) continue;
    lefts.set(id, tab.getBoundingClientRect().left);
  }
  return lefts;
}

export function capturePendingTabFlip(strip: HTMLElement | null): void {
  if (!strip) return;
  const lefts = captureTabStripLefts(strip);
  for (const [id, left] of lefts) pendingFlipFirst.set(id, left);
}

export function capturePendingTabFlipForPane(paneId: string): void {
  const strip = document.querySelector(`.boke-tabs[data-pane="${paneId}"]`);
  capturePendingTabFlip(strip instanceof HTMLElement ? strip : null);
}

export function takePendingTabFlip(): Map<string, number> {
  return pendingFlipFirst;
}

function scheduleClearPendingTabFlip(): void {
  if (clearPendingFlipScheduled) return;
  clearPendingFlipScheduled = true;
  requestAnimationFrame(() => {
    pendingFlipFirst = new Map();
    clearPendingFlipScheduled = false;
  });
}

export function visualTabsForInsert<T extends { id: string; path?: string }>(
  leaves: readonly T[],
  insert: {
    insertBeforeId: string | null;
    excludeLeafId?: string | null;
    incomingPath?: string | null;
  } | null,
  draggingLeafId: string | null,
): VisualTabItem<T>[] {
  const asLeaves = (items: readonly T[]): VisualTabItem<T>[] =>
    items.map((leaf) => ({ type: "leaf" as const, leaf }));
  if (!insert) return asLeaves(leaves);

  const excludeId = insert.excludeLeafId ?? draggingLeafId;
  if (insert.incomingPath && !excludeId && leaves.some((leaf) => leaf.path === insert.incomingPath)) {
    return asLeaves(leaves);
  }

  const remaining = excludeId ? leaves.filter((leaf) => leaf.id !== excludeId) : leaves;
  const items = asLeaves(remaining);
  if (insert.insertBeforeId === null) return [...items, { type: "slot" }];
  const idx = items.findIndex((item) => item.type === "leaf" && item.leaf.id === insert.insertBeforeId);
  if (idx < 0) return [...items, { type: "slot" }];
  return [...items.slice(0, idx), { type: "slot" }, ...items.slice(idx)];
}

export function visualTabOrderKey(items: VisualTabItem<{ id: string }>[]): string {
  return items.map((item) => (item.type === "slot" ? "__slot__" : item.leaf.id)).join("\0");
}

/** FLIP: invert the layout jump so tabs appear to slide into their new slots. */
export function playTabStripFlip(strip: HTMLElement, firstLefts: Map<string, number>): void {
  if (firstLefts.size === 0) return;
  for (const tab of strip.querySelectorAll<HTMLElement>(".boke-tab[data-leaf-id]")) {
    const id = tab.getAttribute("data-leaf-id");
    if (!id) continue;
    const first = firstLefts.get(id);
    if (first == null) continue;
    tab.getAnimations().forEach((animation) => animation.cancel());
    const last = tab.getBoundingClientRect().left;
    const dx = first - last;
    if (Math.abs(dx) < 1) continue;
    tab.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], {
      duration: TAB_FLIP_MS,
      easing: TAB_FLIP_EASING,
    });
  }
  scheduleClearPendingTabFlip();
}
