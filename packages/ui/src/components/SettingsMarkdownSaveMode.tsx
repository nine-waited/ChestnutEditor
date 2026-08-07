import { useT } from "../i18n/index.js";
import { useAppStore, type MarkdownSaveMode } from "../store.js";

export function SettingsMarkdownSaveMode() {
  const t = useT();
  const mode = useAppStore((s) => s.markdownSaveMode);
  const setMode = useAppStore((s) => s.setMarkdownSaveMode);

  return (
    <div className="boke-settings-toggle-row">
      <label className="boke-settings-toggle-label" htmlFor="boke-markdown-save-mode">
        {t("settings.markdownSaveMode")}
      </label>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13, margin: "8px 0" }}>
        {t("settings.markdownSaveModeHint")}
      </p>
      <select
        id="boke-markdown-save-mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as MarkdownSaveMode)}
        aria-label={t("settings.markdownSaveMode")}
      >
        <option value="interval">{t("settings.markdownSaveModeInterval")}</option>
        <option value="realtime">{t("settings.markdownSaveModeRealtime")}</option>
      </select>
    </div>
  );
}
