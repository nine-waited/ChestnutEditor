import { useState } from "react";
import { isTauri } from "@chestnut/storage-adapters";
import { CHESTNUT_APP_VERSION } from "../app-version.js";
import { fetchAppGithubReleasesJson } from "../app-update-desktop.js";
import { evaluateGithubUpdate, parseGithubReleasesJson } from "../app-update.js";
import { CheckUpdateIcon } from "../icons/toolbar-icons.js";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { useUpdateCheckStore } from "../update-check-dialog.js";
import { ToolbarIconButton } from "./ToolbarIconButton.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ToolbarCheckUpdateButton() {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);
  const [busy, setBusy] = useState(false);

  if (!isTauri()) return null;

  return (
    <ToolbarIconButton
      label={busy ? t("toolbar.checkUpdateChecking") : t("toolbar.checkUpdateTooltip")}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void (async () => {
          const dialog = useUpdateCheckStore.getState();
          dialog.start();
          setStatusText(t("status.updateChecking"));
          try {
            await wait(160);
            dialog.startFetchTicker();
            const raw = await fetchAppGithubReleasesJson();
            dialog.stopTicker();
            dialog.setPhase("compare", 88);
            await wait(180);
            const result = evaluateGithubUpdate(CHESTNUT_APP_VERSION, parseGithubReleasesJson(raw));
            if (result.status === "none") {
              setStatusText(t("status.updateNone"));
              dialog.finish({ kind: "none" });
              return;
            }
            const channelLabel =
              result.target.channel === "release"
                ? t("update.channelRelease")
                : t("update.channelPrerelease");
            if (result.status === "up-to-date") {
              setStatusText(
                t("status.updateCurrent", {
                  channel: channelLabel,
                  version: result.target.version,
                }),
              );
              dialog.finish({
                kind: "up-to-date",
                channel: channelLabel,
                version: result.target.version,
              });
              return;
            }
            setStatusText(
              t("status.updateAvailable", {
                channel: channelLabel,
                version: result.target.version,
              }),
            );
            dialog.finish({
              kind: "update-available",
              channel: channelLabel,
              version: result.target.version,
              url: result.target.url,
            });
          } catch (err) {
            console.error("[Chestnut] check for updates failed:", err);
            setStatusText(t("status.updateFailed"));
            dialog.finish({ kind: "failed" });
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <CheckUpdateIcon />
    </ToolbarIconButton>
  );
}
