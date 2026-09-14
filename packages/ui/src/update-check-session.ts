import type { UpdateCheckOutcome } from "./update-check-store.js";

export type UpdateToolbarClickAction = "show" | "ignore" | "retry-check" | "retry-download" | "start-check";

export function isUpdateWorkInProgress(outcome: UpdateCheckOutcome): boolean {
  return outcome.kind === "checking" || outcome.kind === "downloading" || outcome.kind === "opening";
}

export function isUpdateSessionResumable(outcome: UpdateCheckOutcome): boolean {
  return (
    outcome.kind === "checking" ||
    outcome.kind === "downloading" ||
    outcome.kind === "opening" ||
    outcome.kind === "update-available" ||
    outcome.kind === "failed" ||
    outcome.kind === "download-failed"
  );
}

export function shouldResumeUpdateDialog(state: {
  open: boolean;
  sessionActive: boolean;
  outcome: UpdateCheckOutcome;
}): boolean {
  return !state.open && state.sessionActive && isUpdateSessionResumable(state.outcome);
}

export function shouldKeepUpdateSessionOnEscape(outcome: UpdateCheckOutcome): boolean {
  return isUpdateSessionResumable(outcome);
}

export function resolveUpdateToolbarClick(state: {
  open: boolean;
  sessionActive: boolean;
  outcome: UpdateCheckOutcome;
}): UpdateToolbarClickAction {
  if (shouldResumeUpdateDialog(state)) return "show";
  if (!state.open) return "start-check";
  if (state.outcome.kind === "failed") return "retry-check";
  if (state.outcome.kind === "download-failed" && state.outcome.installer) return "retry-download";
  return "ignore";
}
