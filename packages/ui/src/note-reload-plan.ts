/** Pure plan for Markdown tab refresh — DS-002 / DS-008 / DS-012. */
export type MarkdownRefreshPlan = "abort" | "discard-no-flush" | "flush-then-reload" | "reload-no-flush";

export interface MarkdownRefreshPlanInput {
  saveMode: "realtime" | "interval";
  isUnsaved: boolean;
  /** After the unsaved/conflict confirm dialog. */
  discardConfirmed?: boolean;
  /** Current editor buffer (Chestnut in-memory). */
  buffer?: string;
  /** Last content Chestnut loaded or successfully wrote. */
  lastSaved?: string;
  /** Current vault file contents. */
  disk?: string;
}

export function planMarkdownTabRefresh(input: MarkdownRefreshPlanInput): MarkdownRefreshPlan {
  const intervalDirty = input.saveMode === "interval" && input.isUnsaved;
  const hasCompare =
    input.buffer !== undefined && input.lastSaved !== undefined && input.disk !== undefined;
  const localDirty = hasCompare && input.buffer !== input.lastSaved;
  const diskChanged = hasCompare && input.disk !== input.lastSaved;
  const conflict = Boolean(localDirty && diskChanged && input.buffer !== input.disk);

  if (intervalDirty || conflict) {
    if (input.discardConfirmed) return "discard-no-flush";
    return "abort";
  }

  // Clean Chestnut buffer: never write back — disk may be newer (other editor).
  if (hasCompare && !localDirty) return "reload-no-flush";

  // Local edits still pending, disk is what we last wrote: flush debounce then reload.
  if (hasCompare && localDirty && !diskChanged) return "flush-then-reload";

  // No snapshot/disk compare available: keep prior DS-002 flush for pending debounce.
  return "flush-then-reload";
}

export function refreshConfirmIsConflict(input: Pick<MarkdownRefreshPlanInput, "buffer" | "lastSaved" | "disk">): boolean {
  if (input.buffer === undefined || input.lastSaved === undefined || input.disk === undefined) {
    return false;
  }
  return input.buffer !== input.lastSaved && input.disk !== input.lastSaved && input.buffer !== input.disk;
}
