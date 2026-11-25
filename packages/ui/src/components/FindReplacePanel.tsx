import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "../i18n/index.js";
import {
  EMPTY_FIND_STATE,
  MAX_FIND_MATCHES,
  type FindOptions,
  type FindReplaceController,
  type FindState,
} from "../markdown-find-replace.js";
import { useAppStore } from "../store.js";

export interface FindOpenRequest {
  token: number;
  replace: boolean;
  seed: string;
}

export interface FindReplacePanelHandle {
  step(direction: 1 | -1): void;
}

interface FindReplacePanelProps {
  request: FindOpenRequest;
  /** Changes whenever the backing editor changes (mode switch, tab hide). */
  controllerKey: string;
  createController: (onExternalChange: (state: FindState) => void) => FindReplaceController | null;
  readOnly: boolean;
  onClose: () => void;
}

const CONTROLLER_RETRY_MS = 60;
const CONTROLLER_RETRIES = 20;

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={up ? "M8 12.5v-9M4.5 7 8 3.5 11.5 7" : "M8 3.5v9M4.5 9 8 12.5 11.5 9"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ReplaceIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 5.5h7.5a2.5 2.5 0 0 1 0 5H5M7 8.5l-2 2 2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReplaceAllIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 3.5h7.5a2.5 2.5 0 0 1 0 5H5M7 6.5l-2 2 2 2M2.5 12.5h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const FindReplacePanel = forwardRef<FindReplacePanelHandle, FindReplacePanelProps>(function FindReplacePanel(
  { request, controllerKey, createController, readOnly, onClose },
  ref,
) {
  const t = useT();
  const [query, setQuery] = useState(request.seed);
  const [replacement, setReplacement] = useState("");
  const [options, setOptions] = useState<FindOptions>({ caseSensitive: false, wholeWord: false, regex: false });
  const [showReplace, setShowReplace] = useState(request.replace && !readOnly);
  const [state, setState] = useState<FindState>(EMPTY_FIND_STATE);
  const [controllerReady, setControllerReady] = useState(0);
  const controllerRef = useRef<FindReplaceController | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const createControllerRef = useRef(createController);
  createControllerRef.current = createController;

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let attempts = 0;
    const attach = () => {
      if (cancelled) return;
      const controller = createControllerRef.current((next) => {
        if (!cancelled) setState(next);
      });
      if (controller) {
        controllerRef.current = controller;
        setControllerReady((n) => n + 1);
        return;
      }
      attempts += 1;
      if (attempts < CONTROLLER_RETRIES) timer = window.setTimeout(attach, CONTROLLER_RETRY_MS);
    };
    attach();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setState(EMPTY_FIND_STATE);
    };
  }, [controllerKey]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    setState(controller.search({ text: query, ...options }));
  }, [query, options, controllerReady]);

  useEffect(() => {
    if (request.seed) setQuery(request.seed);
    if (request.replace && !readOnly) setShowReplace(true);
    const focusReplace = request.replace && !readOnly && Boolean(request.seed || findInputRef.current?.value);
    const focusInput = () => {
      const input = focusReplace ? replaceInputRef.current : findInputRef.current;
      if (!input || document.activeElement === input) return;
      input.focus();
      input.select();
    };
    // 代码块的 CodeMirror 失焦后会异步抢回焦点，需再补一次。
    requestAnimationFrame(focusInput);
    const timer = window.setTimeout(focusInput, 80);
    return () => window.clearTimeout(timer);
  }, [request, readOnly]);

  useEffect(() => {
    if (readOnly) setShowReplace(false);
  }, [readOnly]);

  const step = useCallback((direction: 1 | -1) => {
    const controller = controllerRef.current;
    if (controller) setState(controller.move(direction));
  }, []);

  useImperativeHandle(ref, () => ({ step }), [step]);

  const close = () => {
    controllerRef.current?.finish(true);
    controllerRef.current = null;
    onClose();
  };

  const replaceCurrent = () => {
    const controller = controllerRef.current;
    if (!controller || readOnly) return;
    setState(controller.replaceCurrent(replacement));
  };

  const replaceAll = () => {
    const controller = controllerRef.current;
    if (!controller || readOnly) return;
    const count = controller.replaceAll(replacement);
    setState(controller.refresh());
    if (count > 0) useAppStore.getState().setStatusText(t("find.replacedAll", { count }));
  };

  const toggleOption = (key: keyof FindOptions) => setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const countLabel = state.invalid
    ? t("find.invalidRegex")
    : !query
      ? ""
      : state.count === 0
        ? t("find.noResults")
        : t("find.count", {
            current: state.current + 1,
            count: state.count >= MAX_FIND_MATCHES ? `${MAX_FIND_MATCHES}+` : state.count,
          });

  const noMatch = Boolean(query) && (state.invalid || state.count === 0);
  const canReplace = !readOnly && state.count > 0;

  return (
    <div
      className={`chestnut-find-panel${showReplace ? " is-replace" : ""}`}
      role="search"
      data-chestnut-shortcut-ignore=""
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      {!readOnly ? (
        <button
          type="button"
          className="chestnut-find-panel__toggle"
          aria-expanded={showReplace}
          title={t("find.toggleReplace")}
          aria-label={t("find.toggleReplace")}
          onClick={() => setShowReplace((open) => !open)}
        >
          <ChevronIcon />
        </button>
      ) : null}
      <div className="chestnut-find-panel__rows">
        <div className="chestnut-find-panel__row">
          <div className={`chestnut-find-panel__field${noMatch ? " is-empty" : ""}`}>
            <input
              ref={findInputRef}
              className="chestnut-find-panel__input"
              value={query}
              placeholder={t("find.findPlaceholder")}
              aria-label={t("find.findPlaceholder")}
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              }}
            />
            <div className="chestnut-find-panel__options">
              <button
                type="button"
                className="chestnut-find-panel__option"
                aria-pressed={options.caseSensitive}
                title={t("find.caseSensitive")}
                aria-label={t("find.caseSensitive")}
                onClick={() => toggleOption("caseSensitive")}
              >
                Aa
              </button>
              <button
                type="button"
                className="chestnut-find-panel__option chestnut-find-panel__option--word"
                aria-pressed={options.wholeWord}
                title={t("find.wholeWord")}
                aria-label={t("find.wholeWord")}
                onClick={() => toggleOption("wholeWord")}
              >
                ab
              </button>
              <button
                type="button"
                className="chestnut-find-panel__option"
                aria-pressed={options.regex}
                title={t("find.regex")}
                aria-label={t("find.regex")}
                onClick={() => toggleOption("regex")}
              >
                .*
              </button>
            </div>
          </div>
          <span className={`chestnut-find-panel__count${noMatch ? " is-empty" : ""}`} aria-live="polite">
            {countLabel}
          </span>
          <button
            type="button"
            className="chestnut-find-panel__btn"
            title={t("find.previous")}
            aria-label={t("find.previous")}
            disabled={state.count === 0}
            onClick={() => step(-1)}
          >
            <ArrowIcon up />
          </button>
          <button
            type="button"
            className="chestnut-find-panel__btn"
            title={t("find.next")}
            aria-label={t("find.next")}
            disabled={state.count === 0}
            onClick={() => step(1)}
          >
            <ArrowIcon />
          </button>
          <button
            type="button"
            className="chestnut-find-panel__btn"
            title={t("find.close")}
            aria-label={t("find.close")}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </div>
        {showReplace ? (
          <div className="chestnut-find-panel__row">
            <div className="chestnut-find-panel__field">
              <input
                ref={replaceInputRef}
                className="chestnut-find-panel__input"
                value={replacement}
                placeholder={t("find.replacePlaceholder")}
                aria-label={t("find.replacePlaceholder")}
                spellCheck={false}
                onChange={(event) => setReplacement(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  if (event.ctrlKey || event.metaKey || event.altKey) replaceAll();
                  else replaceCurrent();
                }}
              />
            </div>
            <button
              type="button"
              className="chestnut-find-panel__btn"
              title={t("find.replace")}
              aria-label={t("find.replace")}
              disabled={!canReplace}
              onClick={replaceCurrent}
            >
              <ReplaceIcon />
            </button>
            <button
              type="button"
              className="chestnut-find-panel__btn"
              title={t("find.replaceAll")}
              aria-label={t("find.replaceAll")}
              disabled={!canReplace}
              onClick={replaceAll}
            >
              <ReplaceAllIcon />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});
