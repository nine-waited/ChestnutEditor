import type { Leaf } from "@chestnut/core";

export type CloseSaveMode = "realtime" | "interval";

/**
 * Leaves that need an unsaved-discard confirm before close (DS-001).
 * Pure: pass saveMode + isUnsaved so tests do not need the app store.
 */
export function leavesNeedingCloseConfirm(
  leaves: Leaf[],
  saveMode: CloseSaveMode,
  isUnsaved: (path: string | undefined) => boolean,
): Leaf[] {
  if (saveMode !== "interval") return [];
  return leaves.filter(
    (leaf) =>
      (leaf.type === "markdown" || leaf.type === "excalidraw") && isUnsaved(leaf.path),
  );
}
