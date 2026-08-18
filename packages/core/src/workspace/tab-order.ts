import type { Leaf } from "./store.js";

/**
 * Move `leafId` so it sits before `insertBeforeId` (null = end).
 * Returns null when the order would not change or the ids are invalid.
 */
export function reorderLeavesById(
  leaves: readonly Leaf[],
  leafId: string,
  insertBeforeId: string | null,
): Leaf[] | null {
  const from = leaves.findIndex((leaf) => leaf.id === leafId);
  if (from < 0) return null;
  const leaf = leaves[from];
  if (leaf.type === "empty") return null;

  let to: number;
  if (insertBeforeId === null) {
    to = leaves.length;
  } else {
    if (insertBeforeId === leafId) return null;
    to = leaves.findIndex((item) => item.id === insertBeforeId);
    if (to < 0) return null;
  }

  if (from < to) to -= 1;
  if (to === from) return null;

  const next = leaves.slice();
  next.splice(from, 1);
  next.splice(to, 0, leaf);
  return next;
}
