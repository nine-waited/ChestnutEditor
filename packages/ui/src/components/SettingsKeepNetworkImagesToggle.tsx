import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";

export function SettingsKeepNetworkImagesToggle() {
  const t = useT();
  const enabled = useAppStore((s) => s.keepNetworkImageLinks);
  const setEnabled = useAppStore((s) => s.setKeepNetworkImageLinks);

  return (
    <div className="boke-settings-toggle-row">
      <div className="boke-settings-toggle-header">
        <span className="boke-settings-toggle-label">{t("settings.keepNetworkImageLinks")}</span>
        <button
          type="button"
          className="boke-switch"
          role="switch"
          aria-checked={enabled}
          aria-label={t("settings.keepNetworkImageLinks")}
          data-on={enabled ? "true" : "false"}
          onClick={() => setEnabled(!enabled)}
        >
          <span className="boke-switch__thumb" aria-hidden="true" />
        </button>
      </div>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13, margin: "8px 0 0" }}>
        {t("settings.keepNetworkImageLinksHint")}
      </p>
    </div>
  );
}
