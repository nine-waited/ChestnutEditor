import { create } from "zustand";
import { useT } from "./i18n/index.js";

export type ExportPhase = "prepare" | "render" | "images" | "generate" | "save" | "done";

export type ExportPhasePrefix = "exportPdf" | "exportMarkdown" | "exportZip" | "importFiles";

interface ExportProgressStartOptions {
  fileName: string;
  titleKey: string;
  phasePrefix: ExportPhasePrefix;
}

interface ExportProgressStore {
  open: boolean;
  fileName: string;
  titleKey: string;
  phasePrefix: ExportPhasePrefix;
  progress: number;
  phase: ExportPhase;
  ticker: ReturnType<typeof setInterval> | null;
  start: (options: ExportProgressStartOptions) => void;
  setProgress: (progress: number, phase: ExportPhase) => void;
  startGeneratingTicker: () => void;
  stopTicker: () => void;
  finishSuccess: () => Promise<void>;
  fail: () => void;
}

const INITIAL_STATE = {
  open: false,
  fileName: "",
  titleKey: "exportPdf.title",
  phasePrefix: "exportPdf" as ExportPhasePrefix,
  progress: 0,
  phase: "prepare" as ExportPhase,
  ticker: null as ReturnType<typeof setInterval> | null,
};

export const useExportProgressStore = create<ExportProgressStore>((set, get) => ({
  ...INITIAL_STATE,

  start(options) {
    get().stopTicker();
    set({
      open: true,
      fileName: options.fileName,
      titleKey: options.titleKey,
      phasePrefix: options.phasePrefix,
      progress: 0,
      phase: "prepare",
    });
  },

  setProgress(progress, phase) {
    set({ progress: Math.min(100, Math.max(0, progress)), phase });
  },

  startGeneratingTicker() {
    get().stopTicker();
    let value = 45;
    const ticker = setInterval(() => {
      value = Math.min(84, value + 1.4);
      set({ progress: value, phase: "generate" });
    }, 180);
    set({ ticker });
  },

  stopTicker() {
    const { ticker } = get();
    if (ticker) clearInterval(ticker);
    set({ ticker: null });
  },

  async finishSuccess() {
    get().stopTicker();
    set({ progress: 100, phase: "done" });
    await new Promise((resolve) => setTimeout(resolve, 480));
    set({ ...INITIAL_STATE });
  },

  fail() {
    get().stopTicker();
    set({ ...INITIAL_STATE });
  },
}));

const PHASE_SUFFIX: Record<ExportPhase, string> = {
  prepare: "phasePrepare",
  render: "phaseRender",
  images: "phaseImages",
  generate: "phaseGenerate",
  save: "phaseSave",
  done: "phaseDone",
};

export function ExportProgressHost() {
  const open = useExportProgressStore((s) => s.open);
  const fileName = useExportProgressStore((s) => s.fileName);
  const titleKey = useExportProgressStore((s) => s.titleKey);
  const phasePrefix = useExportProgressStore((s) => s.phasePrefix);
  const progress = useExportProgressStore((s) => s.progress);
  const phase = useExportProgressStore((s) => s.phase);
  const t = useT();

  if (!open) return null;

  const phaseKey = `${phasePrefix}.${PHASE_SUFFIX[phase]}`;

  return (
    <div className="chestnut-modal-overlay chestnut-confirm-overlay chestnut-pdf-export-overlay" aria-hidden="false">
      <div
        className="chestnut-pdf-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chestnut-export-progress-title"
        aria-describedby="chestnut-export-progress-status"
      >
        <h2 id="chestnut-export-progress-title">{t(titleKey)}</h2>
        <p className="chestnut-pdf-export-file" title={fileName}>
          {fileName}
        </p>
        <div className="chestnut-pdf-export-bar" aria-hidden="true">
          <div className="chestnut-pdf-export-bar__fill" style={{ width: `${progress}%` }} />
        </div>
        <p id="chestnut-export-progress-status" className="chestnut-pdf-export-status">
          {t(phaseKey)} · {Math.round(progress)}%
        </p>
      </div>
    </div>
  );
}
