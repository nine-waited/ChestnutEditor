import { CHESTNUT_APP_VERSION } from "./app-version.js";
import { downloadAndOpenAppInstaller, fetchAppGithubReleasesJson } from "./app-update-desktop.js";
import { evaluateGithubUpdate, parseGithubReleasesJson, type GithubInstallerAsset } from "./app-update.js";
import { useUpdateCheckStore } from "./update-check-store.js";
import { resolveUpdateToolbarClick } from "./update-check-session.js";

type TFn = (key: string, params?: Record<string, string | number>) => string;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let checkInFlight: Promise<void> | null = null;
let downloadInFlight: Promise<void> | null = null;

export function runGithubUpdateCheck(t: TFn, setStatusText: (text: string) => void): Promise<void> {
  if (checkInFlight) return checkInFlight;
  checkInFlight = (async () => {
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
        result.target.channel === "release" ? t("update.channelRelease") : t("update.channelPrerelease");
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
        installer: result.target.installer,
      });
    } catch (err) {
      console.error("[Chestnut] check for updates failed:", err);
      setStatusText(t("status.updateFailed"));
      dialog.finish({ kind: "failed" });
    }
  })().finally(() => {
    checkInFlight = null;
  });
  return checkInFlight;
}

export function startInstallerDownload(
  payload: { channel: string; version: string; url: string; installer: GithubInstallerAsset },
  t: TFn,
  setStatusText: (text: string) => void,
): Promise<void> {
  if (downloadInFlight) return downloadInFlight;
  downloadInFlight = (async () => {
    const dialog = useUpdateCheckStore.getState();
    dialog.beginDownload({ kind: "update-available", ...payload });
    setStatusText(t("status.updateDownloading", { version: payload.version }));
    try {
      await downloadAndOpenAppInstaller(payload.installer.url, payload.installer.fileName);
      dialog.setPhase("open", 100);
      dialog.finish({ kind: "opened", channel: payload.channel, version: payload.version });
      setStatusText(t("status.updateInstallerOpened", { version: payload.version }));
    } catch (err) {
      console.error("[Chestnut] download installer failed:", err);
      setStatusText(t("status.updateDownloadFailed"));
      dialog.finish({
        kind: "download-failed",
        channel: payload.channel,
        version: payload.version,
        url: payload.url,
        installer: payload.installer,
      });
    }
  })().finally(() => {
    downloadInFlight = null;
  });
  return downloadInFlight;
}

export function handleCheckUpdateButtonClick(t: TFn, setStatusText: (text: string) => void): void {
  const dialog = useUpdateCheckStore.getState();
  const action = resolveUpdateToolbarClick(dialog);
  if (action === "show") {
    dialog.show();
    return;
  }
  if (action === "ignore") return;
  if (action === "retry-download" && dialog.outcome.kind === "download-failed" && dialog.outcome.installer) {
    void startInstallerDownload(
      {
        channel: dialog.outcome.channel,
        version: dialog.outcome.version,
        url: dialog.outcome.url,
        installer: dialog.outcome.installer,
      },
      t,
      setStatusText,
    );
    return;
  }
  void runGithubUpdateCheck(t, setStatusText);
}
