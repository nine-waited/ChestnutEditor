import { isTauri } from "@chestnut/storage-adapters";
import { CheckUpdateIcon } from "../icons/toolbar-icons.js";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { handleCheckUpdateButtonClick } from "../update-check-run.js";
import { useUpdateCheckStore } from "../update-check-store.js";
import { isUpdateWorkInProgress, shouldResumeUpdateDialog } from "../update-check-session.js";
import { ToolbarIconButton } from "./ToolbarIconButton.js";

export function ToolbarCheckUpdateButton() {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);
  const open = useUpdateCheckStore((s) => s.open);
  const sessionActive = useUpdateCheckStore((s) => s.sessionActive);
  const outcome = useUpdateCheckStore((s) => s.outcome);

  if (!isTauri()) return null;

  const resumable = shouldResumeUpdateDialog({ open, sessionActive, outcome });
  const workingVisible = open && isUpdateWorkInProgress(outcome);
  const failedVisible = open && (outcome.kind === "failed" || outcome.kind === "download-failed");
  const label = workingVisible
    ? t("toolbar.checkUpdateChecking")
    : failedVisible
      ? t("toolbar.checkUpdateRetry")
      : resumable
        ? isUpdateWorkInProgress(outcome)
          ? t("toolbar.checkUpdateShowProgress")
          : t("toolbar.checkUpdateShowStatus")
        : t("toolbar.checkUpdateTooltip");

  return (
    <ToolbarIconButton
      className="chestnut-toolbar-check-update-btn"
      label={label}
      onClick={() => {
        handleCheckUpdateButtonClick(t, setStatusText);
      }}
    >
      <CheckUpdateIcon />
    </ToolbarIconButton>
  );
}
