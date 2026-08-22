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
          overflow: "auto",
          fontFamily: "var(--boke-font)",
          fontSize: "14px",
        },
        ".cm-gutters": {
          fontFamily: "var(--boke-font)",
        },
        ".cm-heading-level-hashes": {
          color: "var(--boke-text-muted)",
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
        backgroundColor: "var(--boke-bg-secondary)",
        color: "var(--boke-text)",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "var(--boke-font)",
        fontSize: "14px",
      },
      ".cm-content": { caretColor: "var(--boke-text)" },
      ".cm-gutters": {
        backgroundColor: "var(--boke-bg-tertiary)",
        borderRight: "1px solid var(--boke-border)",
        color: "var(--boke-text-muted)",
        fontFamily: "var(--boke-font)",
      },
      ".cm-activeLineGutter": { backgroundColor: "var(--boke-surface)" },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--boke-surface) 60%, transparent)",
      },
      ".cm-heading-level-hashes": {
        color: "var(--boke-text-muted)",
        opacity: 0.8,
      },
    }),
  ];
}
