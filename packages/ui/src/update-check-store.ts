import { create } from "zustand";
import type { GithubInstallerAsset } from "./app-update.js";

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
  sessionActive: boolean;
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
  hide: () => void;
  show: () => void;
  dismiss: () => void;
  close: () => void;
}

const INITIAL_STATE = {
  open: false,
  sessionActive: false,
  progress: 0,
  phase: "connect" as UpdateCheckPhase,
  outcome: { kind: "checking" } as UpdateCheckOutcome,
  received: 0,
  total: 0,
  ticker: null as ReturnType<typeof setInterval> | null,
};

export const useUpdateCheckStore = create<UpdateCheckStore>((set, get) => ({
  ...INITIAL_STATE,

  start() {
    get().stopTicker();
    set({
      open: true,
      sessionActive: true,
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
    const open = get().open;
    const silentSuccess =
      !open && (outcome.kind === "opened" || outcome.kind === "up-to-date" || outcome.kind === "none");
    set({
      progress: 100,
      outcome,
      sessionActive: silentSuccess ? false : get().sessionActive,
    });
  },

  beginDownload(outcome) {
    if (!outcome.installer) return;
    get().stopTicker();
    set({
      open: true,
      sessionActive: true,
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

  hide() {
    set({ open: false });
  },

  show() {
    if (!get().sessionActive) return;
    set({ open: true });
  },

  dismiss() {
    get().stopTicker();
    set({ ...INITIAL_STATE });
  },

  close() {
    get().dismiss();
  },
}));
