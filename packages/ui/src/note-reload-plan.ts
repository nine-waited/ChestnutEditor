/** Pure plan for Markdown tab refresh — DS-002 / DS-008. */
export type MarkdownRefreshPlan = "abort" | "discard-no-flush" | "flush-then-reload";

export function planMarkdownTabRefresh(input: {
  saveMode: "realtime" | "interval";
  isUnsaved: boolean;
  /** After the unsaved confirm dialog; ignored when not interval-dirty. */
  discardConfirmed?: boolean;
}): MarkdownRefreshPlan {
  const intervalDirty = input.saveMode === "interval" && input.isUnsaved;
  if (!intervalDirty) return "flush-then-reload";
  if (input.discardConfirmed) return "discard-no-flush";
  return "abort";
}
