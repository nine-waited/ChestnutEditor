import { useEffect } from "react";
import { create } from "zustand";
import { useT } from "./i18n/index.js";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((confirmed: boolean) => void) | null;
}

interface ConfirmStore extends ConfirmState {
  ask: (options: ConfirmOptions) => Promise<boolean>;
  answer: (confirmed: boolean) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  ask: (options) =>
    new Promise((resolve) => {
      set({ open: true, options, resolve });
    }),
  answer: (confirmed) => {
    const { resolve } = get();
    resolve?.(confirmed);
    set({ open: false, options: null, resolve: null });
  },
}));

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}

export function ConfirmDialogHost() {
  const open = useConfirmStore((s) => s.open);
  const options = useConfirmStore((s) => s.options);
  const answer = useConfirmStore((s) => s.answer);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        answer(true);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        answer(false);
      }
    };
    // Capture so ProseMirror / other editors cannot treat Enter as a newline.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, answer]);

  if (!open || !options) return null;

  const confirmLabel = options.confirmLabel ?? t("common.confirm");
  const cancelLabel = options.cancelLabel ?? t("common.cancel");

  return (
    <div
      className="chestnut-modal-overlay chestnut-confirm-overlay"
      onClick={() => answer(false)}
    >
      <div
        className="chestnut-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="chestnut-confirm-title"
        aria-describedby="chestnut-confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="chestnut-confirm-title">{options.title}</h2>
        <p id="chestnut-confirm-message" style={{ whiteSpace: "pre-wrap" }}>
          {options.message}
        </p>
        <div className="chestnut-confirm-actions">
          <button type="button" onClick={() => answer(false)}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={options.danger ? "chestnut-confirm-danger" : undefined}
            autoFocus
            onClick={() => answer(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
