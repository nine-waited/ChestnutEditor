import { isTauri, openExternalUrl } from "@chestnut/storage-adapters";
import { CHESTNUT_GITHUB_ISSUES_PAGE } from "../app-update.js";
import { FeedbackIcon } from "../icons/toolbar-icons.js";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { ToolbarIconButton } from "./ToolbarIconButton.js";

export function ToolbarFeedbackButton() {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);

  if (!isTauri()) return null;

  return (
    <ToolbarIconButton
      label={t("toolbar.feedbackTooltip")}
      onClick={() => {
        void (async () => {
          try {
            await openExternalUrl(CHESTNUT_GITHUB_ISSUES_PAGE);
            setStatusText(t("status.feedbackOpened"));
          } catch (err) {
            console.error("[Chestnut] open feedback page failed:", err);
            setStatusText(t("status.feedbackFailed"));
          }
        })();
      }}
    >
      <FeedbackIcon />
    </ToolbarIconButton>
  );
}
