import { isTauri } from "@chestnut/storage-adapters";
import { ImportIcon } from "../icons/toolbar-icons.js";
import { importAndOpenPickedMarkdownFiles } from "../markdown-bundle-import.js";
import { isPickCancelled } from "../vault-path-utils.js";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { ToolbarIconButton } from "./ToolbarIconButton.js";

export function ToolbarImportMarkdownButton() {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);

  if (!isTauri()) return null;

  return (
    <ToolbarIconButton
      label={t("toolbar.importMarkdownTooltip")}
      onClick={() => {
        void importAndOpenPickedMarkdownFiles().catch((err) => {
          if (isPickCancelled(err)) return;
          console.error("[Chestnut] import markdown bundle failed:", err);
          setStatusText(t("status.importMarkdownFailed"));
        });
      }}
    >
      <ImportIcon />
    </ToolbarIconButton>
  );
}
