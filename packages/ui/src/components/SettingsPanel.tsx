import { LOCALES, useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import type { Locale } from "../i18n/index.js";
import { UI_FONTS, type UiFont } from "../ui-font.js";
import type { AppTheme } from "../ui-theme.js";
import { SettingsLocalVaultPath } from "./SettingsLocalVaultPath.js";
import { SettingsKeyboardShortcuts } from "./SettingsKeyboardShortcuts.js";
import { SettingsDeleteImageFilesToggle } from "./SettingsDeleteImageFilesToggle.js";
import { SettingsMarkdownSaveMode } from "./SettingsMarkdownSaveMode.js";

export function SettingsPanel() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const uiFont = useAppStore((s) => s.uiFont);
  const setUiFont = useAppStore((s) => s.setUiFont);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <div className="boke-settings">
      <h2>{t("settings.title")}</h2>

      <h3>{t("settings.language")}</h3>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.languageHint")}</p>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t("settings.language")}
      >
        {LOCALES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>

      <h3>{t("settings.font")}</h3>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.fontHint")}</p>
      <select
        value={uiFont}
        onChange={(e) => setUiFont(e.target.value as UiFont)}
        aria-label={t("settings.font")}
      >
        {UI_FONTS.map((item) => (
          <option key={item.value} value={item.value}>
            {t(item.labelKey)}
          </option>
        ))}
      </select>

      <h3>{t("settings.theme")}</h3>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as AppTheme)}
        aria-label={t("settings.theme")}
      >
        <option value="light">{t("settings.themeLight")}</option>
        <option value="dark">{t("settings.themeDark")}</option>
      </select>

      <h3>{t("settings.localStorage")}</h3>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.localStorageHint")}</p>
      <SettingsLocalVaultPath />

      <h3>{t("settings.notes")}</h3>
      <SettingsMarkdownSaveMode />
      <SettingsDeleteImageFilesToggle />

      <h3>{t("settings.shortcuts")}</h3>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.shortcutsHint")}</p>
      <SettingsKeyboardShortcuts />
    </div>
  );
}
