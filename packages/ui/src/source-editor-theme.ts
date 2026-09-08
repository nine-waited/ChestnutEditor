import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import type { AppTheme } from "./ui-theme.js";

export function buildSourceEditorTheme(theme: AppTheme): Extension[] {
  if (theme === "dark") {
    return [
      oneDark,
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": {
          overflowX: "hidden",
          overflowY: "auto",
          fontFamily: "var(--chestnut-font)",
          fontSize: "14px",
        },
        ".cm-gutters": {
          fontFamily: "var(--chestnut-font)",
        },
        ".cm-heading-level-hashes": {
          color: "var(--chestnut-text-muted)",
          opacity: 0.8,
        },
      }),
    ];
  }

  return [
    syntaxHighlighting(defaultHighlightStyle),
    EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "var(--chestnut-bg-secondary)",
        color: "var(--chestnut-text)",
      },
      ".cm-scroller": {
        overflowX: "hidden",
        overflowY: "auto",
        fontFamily: "var(--chestnut-font)",
        fontSize: "14px",
      },
      ".cm-content": { caretColor: "var(--chestnut-text)" },
      ".cm-gutters": {
        backgroundColor: "var(--chestnut-bg-tertiary)",
        borderRight: "1px solid var(--chestnut-border)",
        color: "var(--chestnut-text-muted)",
        fontFamily: "var(--chestnut-font)",
      },
      ".cm-activeLineGutter": { backgroundColor: "var(--chestnut-surface)" },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--chestnut-surface) 60%, transparent)",
      },
      ".cm-heading-level-hashes": {
        color: "var(--chestnut-text-muted)",
        opacity: 0.8,
      },
    }),
  ];
}
