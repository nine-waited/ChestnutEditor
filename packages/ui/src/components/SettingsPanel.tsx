import { LOCALES, useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import type { Locale } from "../i18n/index.js";
import type { AppTheme } from "../ui-theme.js";
import { SettingsFonts } from "./SettingsFonts.js";
import { SettingsLocalVaultPath } from "./SettingsLocalVaultPath.js";
import { SettingsKeyboardShortcuts } from "./SettingsKeyboardShortcuts.js";
import { SettingsDeleteImageFilesToggle } from "./SettingsDeleteImageFilesToggle.js";
import { SettingsKeepNetworkImagesToggle } from "./SettingsKeepNetworkImagesToggle.js";
import { SettingsPlugins } from "./SettingsPlugins.js";

export function SettingsPanel() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <div className="chestnut-settings">
      <h2>{t("settings.title")}</h2>

      <section className="chestnut-settings-group">
        <h3>{t("settings.language")}</h3>
        <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>{t("settings.languageHint")}</p>
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
      </section>

      <section className="chestnut-settings-group">
        <SettingsFonts />
      </section>

      <section className="chestnut-settings-group">
        <h3>{t("settings.theme")}</h3>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as AppTheme)}
          aria-label={t("settings.theme")}
        >
          <option value="light">{t("settings.themeLight")}</option>
          <option value="dark">{t("settings.themeDark")}</option>
        </select>
      </section>

      <section className="chestnut-settings-group">
        <h3>{t("settings.localStorage")}</h3>
        <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>{t("settings.localStorageHint")}</p>
        <SettingsLocalVaultPath />
      </section>

      <section className="chestnut-settings-group">
        <h3>{t("settings.notes")}</h3>
        <SettingsKeepNetworkImagesToggle />
        <SettingsDeleteImageFilesToggle />
      </section>

      <section className="chestnut-settings-group">
        <SettingsPlugins />
      </section>

      <section className="chestnut-settings-group">
        <h3>{t("settings.shortcuts")}</h3>
        <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>{t("settings.shortcutsHint")}</p>
        <SettingsKeyboardShortcuts />
      </section>
    </div>
  );
}
