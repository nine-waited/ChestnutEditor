import { useState } from "react";
import {
  DEFAULT_SHORTCUTS,
  APP_SHORTCUT_IDS,
  normalizeShortcut,
  type AppShortcutId,
} from "../keyboard-shortcuts.js";
import { getShortcutLabel, useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { SettingsEditorKeyboardShortcuts } from "./SettingsEditorKeyboardShortcuts.js";

export function SettingsKeyboardShortcuts() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const keyboardShortcuts = useAppStore((s) => s.keyboardShortcuts);
  const setKeyboardShortcut = useAppStore((s) => s.setKeyboardShortcut);
  const resetAppKeyboardShortcuts = useAppStore((s) => s.resetAppKeyboardShortcuts);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(APP_SHORTCUT_IDS.map((id) => [id, keyboardShortcuts[id]])) as Record<
      AppShortcutId,
      string
    >,
  );

  const commit = (id: AppShortcutId, value: string) => {
    const normalized = normalizeShortcut(value);
    setDrafts((prev) => ({ ...prev, [id]: normalized }));
    setKeyboardShortcut(id, normalized);
  };

  return (
    <div className="chestnut-settings-shortcuts">
      {APP_SHORTCUT_IDS.map((id) => (
        <div key={id} className="chestnut-settings-shortcut-row">
          <label htmlFor={`shortcut-${id}`}>{getShortcutLabel(id, locale)}</label>
          <input
            id={`shortcut-${id}`}
            className="chestnut-settings-shortcut-input"
            value={drafts[id]}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
            onBlur={(e) => commit(id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(id, e.currentTarget.value);
                e.currentTarget.blur();
              }
            }}
            spellCheck={false}
            placeholder={DEFAULT_SHORTCUTS[id]}
            data-chestnut-shortcut-ignore
          />
        </div>
      ))}
      <button
        type="button"
        className="chestnut-settings-shortcuts-reset"
        onClick={() => {
          resetAppKeyboardShortcuts();
          setDrafts(
            Object.fromEntries(APP_SHORTCUT_IDS.map((id) => [id, DEFAULT_SHORTCUTS[id]])) as Record<
              AppShortcutId,
              string
            >,
          );
        }}
      >
        {t("settings.shortcutsReset")}
      </button>

      <SettingsEditorKeyboardShortcuts />
    </div>
  );
}
