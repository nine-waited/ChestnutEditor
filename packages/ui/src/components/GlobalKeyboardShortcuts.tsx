import { useEffect, useRef } from "react";
import { isTauri } from "@chestnut/storage-adapters";
import {
  DOUBLE_TAP_WINDOW_MS,
  isDoubleTapShortcut,
  matchesShortcut,
} from "../keyboard-shortcuts.js";
import { toggleCurrentMarkdownSourceMode } from "../commands.js";
import { useAppStore } from "../store.js";

export const TOGGLE_SOURCE_EVENT = "chestnut-toggle-source";

/** Ignore global shortcuts briefly after focus returns to avoid Alt+Tab residue. */
const SHORTCUT_FOCUS_COOLDOWN_MS = 350;

function isShortcutInputTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("[data-boke-shortcut-ignore]"));
}

export function GlobalKeyboardShortcuts() {
  const keyboardShortcuts = useAppStore((s) => s.keyboardShortcuts);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const lastShiftUpAt = useRef(0);
  const shiftDownInWindow = useRef(false);
  const shortcutsBlockedUntil = useRef(0);

  useEffect(() => {
    const quickOpenShortcut = keyboardShortcuts["quick-open"];
    const useDoubleShift = isDoubleTapShortcut(quickOpenShortcut);

    const resetDoubleShift = () => {
      lastShiftUpAt.current = 0;
      shiftDownInWindow.current = false;
    };

    const markFocusCooldown = () => {
      shortcutsBlockedUntil.current = Date.now() + SHORTCUT_FOCUS_COOLDOWN_MS;
      resetDoubleShift();
    };

    const shortcutsBlocked = () =>
      !document.hasFocus() || Date.now() < shortcutsBlockedUntil.current;

    const toggleQuickOpen = () => {
      const open = useAppStore.getState().commandPaletteOpen;
      setCommandPaletteOpen(!open);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (shortcutsBlocked() || isShortcutInputTarget(event.target)) return;

      if (useDoubleShift && event.key === "Shift" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        shiftDownInWindow.current = true;
      } else if (useDoubleShift && event.key !== "Shift") {
        resetDoubleShift();
      }

      if (!useDoubleShift && matchesShortcut(event, quickOpenShortcut)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleQuickOpen();
        return;
      }

      if (matchesShortcut(event, keyboardShortcuts.search)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const open = useAppStore.getState().searchOpen;
        setSearchOpen(!open);
        return;
      }

      if (
        matchesShortcut(event, keyboardShortcuts["md-toggle-source"]) &&
        event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleCurrentMarkdownSourceMode();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!useDoubleShift || shortcutsBlocked() || isShortcutInputTarget(event.target)) return;
      if (event.key !== "Shift" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!shiftDownInWindow.current) return;

      shiftDownInWindow.current = false;

      const now = Date.now();
      if (lastShiftUpAt.current && now - lastShiftUpAt.current <= DOUBLE_TAP_WINDOW_MS) {
        event.preventDefault();
        resetDoubleShift();
        toggleQuickOpen();
        return;
      }

      lastShiftUpAt.current = now;
    };

    const onWindowBlur = () => {
      resetDoubleShift();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        resetDoubleShift();
        return;
      }
      markFocusCooldown();
    };

    // Capture on both window and document: WebView2 may deliver keys to either.
    const capture = true;
    window.addEventListener("keydown", onKeyDown, capture);
    document.addEventListener("keydown", onKeyDown, capture);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", markFocusCooldown);
    document.addEventListener("visibilitychange", onVisibilityChange);

    let cancelled = false;
    let unlistenToggleSource: (() => void) | undefined;
    if (isTauri()) {
      void import(/* @vite-ignore */ "@tauri-apps/api/event").then(({ listen }) => {
        void listen(TOGGLE_SOURCE_EVENT, () => {
          toggleCurrentMarkdownSourceMode();
        }).then((unlisten) => {
          if (cancelled) {
            unlisten();
            return;
          }
          unlistenToggleSource = unlisten;
        });
      });
    }

    return () => {
      cancelled = true;
      unlistenToggleSource?.();
      window.removeEventListener("keydown", onKeyDown, capture);
      document.removeEventListener("keydown", onKeyDown, capture);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", markFocusCooldown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [keyboardShortcuts, setCommandPaletteOpen, setSearchOpen]);

  return null;
}
