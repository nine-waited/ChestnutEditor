import { useState } from "react";
import {
  DEFAULT_SHORTCUTS,
  EDITOR_SHORTCUT_IDS,
  formatShortcutLabel,
  loadConfigurableEditorKeyboardShortcuts,
  normalizeShortcut,
  isFixedEditorShortcut,
  type ConfigurableEditorShortcutId,
  type EditorShortcutId,
} from "../keyboard-shortcuts.js";
import { getShortcutLabel, useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";

export function SettingsEditorKeyboardShortcuts() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const keyboardShortcuts = useAppStore((s) => s.keyboardShortcuts);
  const setKeyboardShortcut = useAppStore((s) => s.setKeyboardShortcut);
  const resetEditorKeyboardShortcuts = useAppStore((s) => s.resetEditorKeyboardShortcuts);
  const [drafts, setDrafts] = useState(() => loadConfigurableEditorKeyboardShortcuts(keyboardShortcuts));

  const commit = (id: ConfigurableEditorShortcutId, value: string) => {
    const normalized = normalizeShortcut(value);
    setDrafts((prev) => ({ ...prev, [id]: normalized }));
    setKeyboardShortcut(id, normalized);
  };

  return (
    <details className="chestnut-settings-shortcuts-details">
      <summary>{t("settings.editorShortcuts")}</summary>
      <p className="chestnut-settings-shortcuts-details-hint">{t("settings.editorShortcutsHint")}</p>
      <div className="chestnut-settings-shortcuts chestnut-settings-shortcuts--editor">
        {EDITOR_SHORTCUT_IDS.map((id) => (
          <div key={id} className="chestnut-settings-shortcut-row">
            <label htmlFor={`shortcut-${id}`}>{getShortcutLabel(id, locale)}</label>
            {isFixedEditorShortcut(id) ? (
              <span
                id={`shortcut-${id}`}
                className="chestnut-settings-shortcut-fixed"
                title={t("settings.shortcutFixedHint")}
              >
                {formatShortcutLabel(DEFAULT_SHORTCUTS[id])}
              </span>
            ) : (
              <input
                id={`shortcut-${id}`}
                className="chestnut-settings-shortcut-input"
                value={drafts[id as ConfigurableEditorShortcutId]}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [id as ConfigurableEditorShortcutId]: e.target.value }))
                }
                onBlur={(e) => commit(id as ConfigurableEditorShortcutId, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commit(id as ConfigurableEditorShortcutId, e.currentTarget.value);
                    e.currentTarget.blur();
                  }
                }}
                spellCheck={false}
                placeholder={DEFAULT_SHORTCUTS[id]}
                data-chestnut-shortcut-ignore
              />
            )}
          </div>
        ))}
        <button
          type="button"
          className="chestnut-settings-shortcuts-reset"
          onClick={() => {
            resetEditorKeyboardShortcuts();
            setDrafts(loadConfigurableEditorKeyboardShortcuts(DEFAULT_SHORTCUTS));
          }}
        >
          {t("settings.editorShortcutsReset")}
        </button>
      </div>
    </details>
  );
}
