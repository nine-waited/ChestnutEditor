import type { EditorView } from "@codemirror/view";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { Ctx } from "@milkdown/ctx";
import type { Crepe } from "@milkdown/crepe";
import { getMarkdown } from "@milkdown/utils";
import {
  matchEditorShortcut,
  matchesShortcut,
  parseShortcut,
  type KeyboardShortcuts,
} from "./keyboard-shortcuts.js";
import { runLiveEditorShortcut } from "./markdown-editor-actions.js";
import { runSourceEditorShortcut } from "./markdown-source-actions.js";
import { useAppStore } from "./store.js";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-boke-shortcut-ignore]")) return false;
  if (target.closest(".ProseMirror")) return true;
  if (target.closest(".cm-editor")) return true;
  return false;
}

export function attachLiveEditorShortcutKeymap(
  root: HTMLElement,
  crepe: Crepe,
  getMarkdownContent: () => string,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isEditableTarget(event.target)) return;
    const shortcuts = useAppStore.getState().keyboardShortcuts;
    if (matchesShortcut(event, shortcuts.search)) {
      event.preventDefault();
      event.stopPropagation();
      const open = useAppStore.getState().searchOpen;
      useAppStore.getState().setSearchOpen(!open);
      return;
    }
    const shortcutId = matchEditorShortcut(event, shortcuts);
    if (!shortcutId) return;

    event.preventDefault();
    event.stopPropagation();

    crepe.editor.action((ctx) => {
      const markdown = getMarkdown()(ctx) || getMarkdownContent();
      runLiveEditorShortcut(ctx, shortcutId, markdown);
    });
  };

  root.addEventListener("keydown", onKeyDown, true);
  return () => root.removeEventListener("keydown", onKeyDown, true);
}

export function buildSourceEditorShortcutKeymap(getContent: () => string): Extension {
  return Prec.highest(
    keymap.of([
      {
        any: (view, event) => {
          if (!(event instanceof KeyboardEvent)) return false;
          const shortcuts = useAppStore.getState().keyboardShortcuts;
          if (matchesShortcut(event, shortcuts.search)) {
            event.preventDefault();
            const open = useAppStore.getState().searchOpen;
            useAppStore.getState().setSearchOpen(!open);
            return true;
          }
          const shortcutId = matchEditorShortcut(event, shortcuts);
          if (!shortcutId) return false;
          event.preventDefault();
          return runSourceEditorShortcut(view, shortcutId, getContent());
        },
      },
    ]),
  );
}

export function editorShortcutUsesWheel(shortcuts: KeyboardShortcuts): boolean {
  return Boolean(shortcuts["md-editor-zoom"]?.toLowerCase().includes("wheel"));
}

export function wheelShortcutMatches(event: WheelEvent, shortcuts: KeyboardShortcuts): boolean {
  const raw = shortcuts["md-editor-zoom"];
  if (!raw?.toLowerCase().includes("wheel")) return false;
  const parsed = parseShortcut(raw);
  if (!parsed) return false;
  const wantsCtrl = parsed.ctrl || parsed.meta;
  const hasCtrl = event.ctrlKey || event.metaKey;
  return hasCtrl === wantsCtrl && event.shiftKey === parsed.shift && event.altKey === parsed.alt;
}
