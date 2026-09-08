import { useEffect } from "react";
import { create } from "zustand";
import { openExternalUrl } from "@chestnut/storage-adapters";
import { CHESTNUT_APP_VERSION } from "./app-version.js";
import {
  downloadAndOpenAppInstaller,
  listenAppInstallerDownloadProgress,
} from "./app-update-desktop.js";
import {
  formatInstallerDownloadProgress,
  type GithubInstallerAsset,
} from "./app-update.js";
import { useT } from "./i18n/index.js";
import { useAppStore } from "./store.js";

export type UpdateCheckPhase = "connect" | "fetch" | "compare" | "download" | "open";

export type UpdateCheckOutcome =
  | { kind: "checking" }
  | { kind: "up-to-date"; channel: string; version: string }
  | { kind: "none" }
  | {
      kind: "update-available";
      channel: string;
      version: string;
      url: string;
      installer: GithubInstallerAsset | null;
    }
  | {
      kind: "downloading";
      channel: string;
      version: string;
      url: string;
      installer: GithubInstallerAsset;
    }
  | { kind: "opening"; channel: string; version: string }
  | { kind: "opened"; channel: string; version: string }
  | { kind: "failed" }
  | {
      kind: "download-failed";
      channel: string;
      version: string;
      url: string;
      installer: GithubInstallerAsset | null;
    };

interface UpdateCheckStore {
  open: boolean;
  progress: number;
  phase: UpdateCheckPhase;
  outcome: UpdateCheckOutcome;
  received: number;
  total: number;
  ticker: ReturnType<typeof setInterval> | null;
  start: () => void;
  setPhase: (phase: UpdateCheckPhase, progress?: number) => void;
  startFetchTicker: () => void;
  stopTicker: () => void;
  finish: (outcome: Exclude<UpdateCheckOutcome, { kind: "checking" }>) => void;
  beginDownload: (outcome: Extract<UpdateCheckOutcome, { kind: "update-available" | "download-failed" }>) => void;
  setDownloadBytes: (received: number, total: number) => void;
  close: () => void;
}

const INITIAL_STATE = {
  open: false,
  progress: 0,
  phase: "connect" as UpdateCheckPhase,
  outcome: { kind: "checking" } as UpdateCheckOutcome,
  received: 0,
  total: 0,
  ticker: null as ReturnType<typeof setInterval> | null,
};

const PHASE_KEYS: Record<UpdateCheckPhase, string> = {
  connect: "update.phaseConnect",
  fetch: "update.phaseFetch",
  compare: "update.phaseCompare",
  download: "update.phaseDownload",
  open: "update.phaseOpen",
};

export function isUpdateWorkInProgress(outcome: UpdateCheckOutcome): boolean {
  return outcome.kind === "checking" || outcome.kind === "downloading" || outcome.kind === "opening";
}

export const useUpdateCheckStore = create<UpdateCheckStore>((set, get) => ({
  ...INITIAL_STATE,

  start() {
    get().stopTicker();
    set({
      open: true,
      progress: 12,
      phase: "connect",
      outcome: { kind: "checking" },
      received: 0,
      total: 0,
    });
  },

  setPhase(phase, progress) {
    set((state) => ({
      phase,
      progress: progress ?? state.progress,
    }));
  },

  startFetchTicker() {
    get().stopTicker();
    let value = 22;
    set({ phase: "fetch", progress: value });
    const ticker = setInterval(() => {
      value = Math.min(74, value + 2.4);
      set({ progress: value, phase: "fetch" });
    }, 160);
    set({ ticker });
  },

  stopTicker() {
    const { ticker } = get();
    if (ticker) clearInterval(ticker);
    set({ ticker: null });
  },

  finish(outcome) {
    get().stopTicker();
    set({
      open: true,
      progress: 100,
      outcome,
    });
  },

  beginDownload(outcome) {
    if (!outcome.installer) return;
    get().stopTicker();
    set({
      open: true,
      phase: "download",
      progress: 2,
      received: 0,
      total: outcome.installer.size,
      outcome: {
        kind: "downloading",
        channel: outcome.channel,
        version: outcome.version,
        url: outcome.url,
        installer: outcome.installer,
      },
    });
  },

  setDownloadBytes(received, total) {
    const hint = get().total;
    const denom = total > 0 ? total : hint;
    const pct = denom > 0 ? Math.min(99, (received / denom) * 100) : get().progress;
    set({
      received,
      total: denom,
      progress: pct,
      phase: "download",
    });
  },

  close() {
    get().stopTicker();
    set({ ...INITIAL_STATE });
  },
}));

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
  const close = useUpdateCheckStore((s) => s.close);
  const t = useT();

  const working = isUpdateWorkInProgress(outcome);

  useEffect(() => {
    if (!open || working) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, working, close]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

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
      className="boke-modal-overlay boke-confirm-overlay boke-update-check-overlay"
      onClick={working ? undefined : () => close()}
    >
      <div
        className="boke-pdf-export-dialog boke-update-check-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boke-update-check-title"
        aria-describedby="boke-update-check-status"
        aria-busy={working}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="boke-update-check-title">{t(titleKey(outcome))}</h2>
        <p className="boke-pdf-export-file">
          {t("update.checkCurrent", { version: CHESTNUT_APP_VERSION })}
        </p>
        <div className="boke-pdf-export-bar" aria-hidden="true">
          <div
            className={`boke-pdf-export-bar__fill${
              outcome.kind === "failed" || outcome.kind === "download-failed" ? " is-failed" : ""
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          id="boke-update-check-status"
          className={`boke-pdf-export-status${
            outcome.kind === "failed" || outcome.kind === "download-failed" ? " is-failed" : ""
          }`}
        >
          {statusText}
        </p>
        {resultText ? (
          <p
            className={`boke-update-check-result${
              outcome.kind === "failed" || outcome.kind === "download-failed" ? " is-failed" : ""
            }`}
          >
            {resultText}
          </p>
        ) : null}
        {!working ? (
          <div className="boke-confirm-actions">
            <button type="button" onClick={() => close()}>
              {t("update.close")}
            </button>
            {outcome.kind === "update-available" || outcome.kind === "download-failed" ? (
              outcome.installer ? (
                <UpdateConfirmButton
                  channel={outcome.channel}
                  version={outcome.version}
                  url={outcome.url}
                  installer={outcome.installer}
                />
              ) : (
                <UpdateOpenDownloadButton url={outcome.url} version={outcome.version} />
              )
            ) : null}
          </div>
        ) : null}
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
        void (async () => {
          const dialog = useUpdateCheckStore.getState();
          dialog.beginDownload({ kind: "update-available", channel, version, url, installer });
          setStatusText(t("status.updateDownloading", { version }));
          try {
            await downloadAndOpenAppInstaller(installer.url, installer.fileName);
            dialog.setPhase("open", 100);
            dialog.finish({ kind: "opened", channel, version });
            setStatusText(t("status.updateInstallerOpened", { version }));
          } catch (err) {
            console.error("[Chestnut] download installer failed:", err);
            setStatusText(t("status.updateDownloadFailed"));
            dialog.finish({
              kind: "download-failed",
              channel,
              version,
              url,
              installer,
            });
          }
        })();
      }}
    >
      {t("update.confirm")}
    </button>
  );
}

function UpdateOpenDownloadButton({ url, version }: { url: string; version: string }) {
  const t = useT();
  const setStatusText = useAppStore((s) => s.setStatusText);
  return (
    <button
      type="button"
      autoFocus
      onClick={() => {
        void (async () => {
          try {
            await openExternalUrl(url);
            setStatusText(t("status.updateOpened", { version }));
            useUpdateCheckStore.getState().close();
          } catch (err) {
            console.error("[Chestnut] open update download page failed:", err);
            setStatusText(t("status.updateFailed"));
          }
        })();
      }}
    >
      {t("update.openDownload")}
    </button>
  );
}
