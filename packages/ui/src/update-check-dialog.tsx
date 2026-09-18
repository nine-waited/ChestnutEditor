import { useCallback, useEffect } from "react";
import { openExternalUrl } from "@chestnut/storage-adapters";
import { CHESTNUT_APP_VERSION } from "./app-version.js";
import { listenAppInstallerDownloadProgress } from "./app-update-desktop.js";
import {
  CHESTNUT_GITCODE_RELEASES_PAGE,
  CHESTNUT_GITHUB_RELEASES_PAGE,
  formatInstallerDownloadProgress,
  type GithubInstallerAsset,
} from "./app-update.js";
import { useT } from "./i18n/index.js";
import { useAppStore } from "./store.js";
import { runGithubUpdateCheck, startInstallerDownload } from "./update-check-run.js";
import {
  isUpdateWorkInProgress,
  shouldKeepUpdateSessionOnEscape,
} from "./update-check-session.js";
import {
  useUpdateCheckStore,
  type UpdateCheckOutcome,
  type UpdateCheckPhase,
} from "./update-check-store.js";

export { isUpdateWorkInProgress } from "./update-check-session.js";
export { useUpdateCheckStore } from "./update-check-store.js";
export type { UpdateCheckOutcome, UpdateCheckPhase };

const PHASE_KEYS: Record<UpdateCheckPhase, string> = {
  connect: "update.phaseConnect",
  fetch: "update.phaseFetch",
  compare: "update.phaseCompare",
  download: "update.phaseDownload",
  open: "update.phaseOpen",
};

function titleKey(outcome: UpdateCheckOutcome): string {
  if (outcome.kind === "up-to-date") return "update.resultTitleCurrent";
  if (outcome.kind === "none") return "update.resultTitleNone";
  if (outcome.kind === "update-available") return "update.availableTitle";
  if (outcome.kind === "downloading") return "update.resultTitleDownloading";
  if (outcome.kind === "opening") return "update.resultTitleDownloading";
  if (outcome.kind === "opened") return "update.resultTitleOpened";
  if (outcome.kind === "failed") return "update.resultTitleFailed";
  if (outcome.kind === "download-failed") return "update.resultTitleDownloadFailed";
  return "update.checkTitle";
}

export function UpdateCheckDialogHost() {
  const open = useUpdateCheckStore((s) => s.open);
  const progress = useUpdateCheckStore((s) => s.progress);
  const phase = useUpdateCheckStore((s) => s.phase);
  const outcome = useUpdateCheckStore((s) => s.outcome);
  const received = useUpdateCheckStore((s) => s.received);
  const total = useUpdateCheckStore((s) => s.total);
  const hide = useUpdateCheckStore((s) => s.hide);
  const dismiss = useUpdateCheckStore((s) => s.dismiss);
  const t = useT();

  const working = isUpdateWorkInProgress(outcome);

  const hideOrDismiss = useCallback(() => {
    if (shouldKeepUpdateSessionOnEscape(outcome)) hide();
    else dismiss();
  }, [outcome, hide, dismiss]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      hideOrDismiss();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, hideOrDismiss]);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void listenAppInstallerDownloadProgress((payload) => {
      const state = useUpdateCheckStore.getState();
      if (state.outcome.kind !== "downloading") return;
      state.setDownloadBytes(payload.received, payload.total);
    }).then((unlisten) => {
      stop = unlisten;
    });
    return () => {
      stop?.();
    };
  }, []);

  if (!open) return null;

  const resultText =
    outcome.kind === "up-to-date"
      ? t("update.resultCurrent", { channel: outcome.channel, version: outcome.version })
      : outcome.kind === "none"
        ? t("update.resultNone")
        : outcome.kind === "update-available"
          ? outcome.installer
            ? t("update.resultAvailable", {
                current: CHESTNUT_APP_VERSION,
                channel: outcome.channel,
                version: outcome.version,
              })
            : t("update.resultNoInstaller")
          : outcome.kind === "download-failed"
            ? t("update.resultDownloadFailed")
          : outcome.kind === "downloading"
            ? t("update.resultDownloading", { file: outcome.installer.fileName })
            : outcome.kind === "opening"
              ? t("update.phaseOpen")
              : outcome.kind === "opened"
                ? t("update.resultOpenedInstaller")
                : outcome.kind === "failed"
                  ? t("update.resultFailed")
                  : null;

  const statusText = working
    ? outcome.kind === "downloading"
      ? `${t(PHASE_KEYS.download)} · ${formatInstallerDownloadProgress(received, total)} · ${Math.round(progress)}%`
      : `${t(PHASE_KEYS[phase])} · ${Math.round(progress)}%`
    : outcome.kind === "failed" || outcome.kind === "download-failed"
      ? t("update.phaseFailed")
      : t("update.phaseDone");

  return (
    <div
      className="chestnut-modal-overlay chestnut-confirm-overlay chestnut-update-check-overlay"
      onClick={hideOrDismiss}
    >
      <div
        className="chestnut-pdf-export-dialog chestnut-update-check-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chestnut-update-check-title"
        aria-describedby="chestnut-update-check-status"
        aria-busy={working}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="chestnut-update-check-title">{t(titleKey(outcome))}</h2>
        <p className="chestnut-pdf-export-file">
          {t("update.checkCurrent", { version: CHESTNUT_APP_VERSION })}
        </p>
        <div className="chestnut-pdf-export-bar" aria-hidden="true">
          <div
            className={`chestnut-pdf-export-bar__fill${
              outcome.kind === "failed" || outcome.kind === "download-failed" ? " is-failed" : ""
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          id="chestnut-update-check-status"
          className={`chestnut-pdf-export-status${
            outcome.kind === "failed" || outcome.kind === "download-failed" ? " is-failed" : ""
          }`}
        >
          {statusText}
        </p>
        {resultText ? (
          <p
            className={`chestnut-update-check-result${
              outcome.kind === "failed" || outcome.kind === "download-failed" ? " is-failed" : ""
            }`}
          >
            {resultText}
          </p>
        ) : null}
        {working ? (
          <p className="chestnut-update-check-hint">{t("update.backgroundHint")}</p>
        ) : null}
        <div className="chestnut-confirm-actions">
          {working ? (
            <button type="button" onClick={() => hide()}>
              {t("update.hide")}
            </button>
          ) : (
            <>
              <button type="button" onClick={hideOrDismiss}>
                {t("update.close")}
              </button>
              {outcome.kind === "failed" ? (
                <>
                  <UpdateRetryCheckButton />
                  <UpdateReleasePageButtons />
                </>
              ) : null}
              {outcome.kind === "update-available" || outcome.kind === "download-failed" ? (
                <>
                  {outcome.installer ? (
                    <UpdateConfirmButton
                      channel={outcome.channel}
                      version={outcome.version}
                      url={outcome.url}
                      installer={outcome.installer}
                    />
                  ) : null}
                  <UpdateReleasePageButtons
                    githubUrl={outcome.url}
                    version={outcome.version}
                  />
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UpdateConfirmButton({
  channel,
  version,
  url,
  installer,
}: {
  channel: string;
  version: string;
  url: string;
  installer: GithubInstallerAsset;
}) {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);
  return (
    <button
      type="button"
      autoFocus
      onClick={() => {
        void startInstallerDownload({ channel, version, url, installer }, t, setStatusText);
      }}
    >
      {t("update.confirm")}
    </button>
  );
}

function UpdateRetryCheckButton() {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);
  return (
    <button
      type="button"
      autoFocus
      onClick={() => {
        void runGithubUpdateCheck(t, setStatusText);
      }}
    >
      {t("update.retry")}
    </button>
  );
}

function UpdateReleasePageButtons({
  githubUrl = CHESTNUT_GITHUB_RELEASES_PAGE,
  version,
}: {
  githubUrl?: string;
  version?: string;
}) {
  const gitcodeUrl = version
    ? `${CHESTNUT_GITCODE_RELEASES_PAGE}/tag/v${version}`
    : CHESTNUT_GITCODE_RELEASES_PAGE;
  return (
    <>
      <UpdateOpenDownloadButton
        labelKey="update.openGitCode"
        url={gitcodeUrl}
        version={version}
      />
      <UpdateOpenDownloadButton
        labelKey="update.openGitHub"
        url={githubUrl}
        version={version}
      />
    </>
  );
}

function UpdateOpenDownloadButton({
  labelKey,
  url,
  version,
}: {
  labelKey: string;
  url: string;
  version?: string;
}) {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);
  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          try {
            await openExternalUrl(url);
            setStatusText(
              version
                ? t("status.updateOpened", { version })
                : t("status.updateReleasePageOpened"),
            );
            useUpdateCheckStore.getState().dismiss();
          } catch (err) {
            console.error("[Chestnut] open update download page failed:", err);
            setStatusText(t("status.updateFailed"));
          }
        })();
      }}
    >
      {t(labelKey)}
    </button>
  );
}
