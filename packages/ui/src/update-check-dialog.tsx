import { useEffect } from "react";
import { create } from "zustand";
import { openExternalUrl } from "@chestnut/storage-adapters";
import { CHESTNUT_APP_VERSION } from "./app-version.js";
import { useT } from "./i18n/index.js";
import { useAppStore } from "./store.js";

export type UpdateCheckPhase = "connect" | "fetch" | "compare";

export type UpdateCheckOutcome =
  | { kind: "checking" }
  | { kind: "up-to-date"; channel: string; version: string }
  | { kind: "none" }
  | { kind: "update-available"; channel: string; version: string; url: string }
  | { kind: "failed" };

interface UpdateCheckStore {
  open: boolean;
  progress: number;
  phase: UpdateCheckPhase;
  outcome: UpdateCheckOutcome;
  ticker: ReturnType<typeof setInterval> | null;
  start: () => void;
  setPhase: (phase: UpdateCheckPhase, progress?: number) => void;
  startFetchTicker: () => void;
  stopTicker: () => void;
  finish: (outcome: Exclude<UpdateCheckOutcome, { kind: "checking" }>) => void;
  close: () => void;
}

const INITIAL_STATE = {
  open: false,
  progress: 0,
  phase: "connect" as UpdateCheckPhase,
  outcome: { kind: "checking" } as UpdateCheckOutcome,
  ticker: null as ReturnType<typeof setInterval> | null,
};

const PHASE_KEYS: Record<UpdateCheckPhase, string> = {
  connect: "update.phaseConnect",
  fetch: "update.phaseFetch",
  compare: "update.phaseCompare",
};

export const useUpdateCheckStore = create<UpdateCheckStore>((set, get) => ({
  ...INITIAL_STATE,

  start() {
    get().stopTicker();
    set({
      open: true,
      progress: 12,
      phase: "connect",
      outcome: { kind: "checking" },
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

  close() {
    get().stopTicker();
    set({ ...INITIAL_STATE });
  },
}));

function titleKey(outcome: UpdateCheckOutcome): string {
  if (outcome.kind === "up-to-date") return "update.resultTitleCurrent";
  if (outcome.kind === "none") return "update.resultTitleNone";
  if (outcome.kind === "update-available") return "update.availableTitle";
  if (outcome.kind === "failed") return "update.resultTitleFailed";
  return "update.checkTitle";
}

export function UpdateCheckDialogHost() {
  const open = useUpdateCheckStore((s) => s.open);
  const progress = useUpdateCheckStore((s) => s.progress);
  const phase = useUpdateCheckStore((s) => s.phase);
  const outcome = useUpdateCheckStore((s) => s.outcome);
  const close = useUpdateCheckStore((s) => s.close);
  const t = useT();

  const checking = outcome.kind === "checking";

  useEffect(() => {
    if (!open || checking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, checking, close]);

  if (!open) return null;

  const resultText =
    outcome.kind === "up-to-date"
      ? t("update.resultCurrent", { channel: outcome.channel, version: outcome.version })
      : outcome.kind === "none"
        ? t("update.resultNone")
        : outcome.kind === "update-available"
          ? t("update.resultAvailable", {
              current: CHESTNUT_APP_VERSION,
              channel: outcome.channel,
              version: outcome.version,
            })
          : outcome.kind === "failed"
            ? t("update.resultFailed")
            : null;

  return (
    <div
      className="boke-modal-overlay boke-confirm-overlay boke-update-check-overlay"
      onClick={checking ? undefined : () => close()}
    >
      <div
        className="boke-pdf-export-dialog boke-update-check-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="boke-update-check-title"
        aria-describedby="boke-update-check-status"
        aria-busy={checking}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="boke-update-check-title">{t(titleKey(outcome))}</h2>
        <p className="boke-pdf-export-file">
          {t("update.checkCurrent", { version: CHESTNUT_APP_VERSION })}
        </p>
        <div className="boke-pdf-export-bar" aria-hidden="true">
          <div
            className={`boke-pdf-export-bar__fill${outcome.kind === "failed" ? " is-failed" : ""}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          id="boke-update-check-status"
          className={`boke-pdf-export-status${outcome.kind === "failed" ? " is-failed" : ""}`}
        >
          {checking
            ? `${t(PHASE_KEYS[phase])} · ${Math.round(progress)}%`
            : outcome.kind === "failed"
              ? t("update.phaseFailed")
              : t("update.phaseDone")}
        </p>
        {resultText ? (
          <p
            className={`boke-update-check-result${outcome.kind === "failed" ? " is-failed" : ""}`}
          >
            {resultText}
          </p>
        ) : null}
        {!checking ? (
          <div className="boke-confirm-actions">
            <button type="button" onClick={() => close()}>
              {t("update.close")}
            </button>
            {outcome.kind === "update-available" ? (
              <UpdateOpenDownloadButton url={outcome.url} version={outcome.version} />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
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
