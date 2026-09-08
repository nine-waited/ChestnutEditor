import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";

export function SettingsKeepNetworkImagesToggle() {
  const t = useT();
  const enabled = useAppStore((s) => s.keepNetworkImageLinks);
  const setEnabled = useAppStore((s) => s.setKeepNetworkImageLinks);

  return (
    <div className="chestnut-settings-toggle-row">
      <div className="chestnut-settings-toggle-header">
        <span className="chestnut-settings-toggle-label">{t("settings.keepNetworkImageLinks")}</span>
        <button
          type="button"
          className="chestnut-switch"
          role="switch"
          aria-checked={enabled}
          aria-label={t("settings.keepNetworkImageLinks")}
          data-on={enabled ? "true" : "false"}
          onClick={() => setEnabled(!enabled)}
        >
          <span className="chestnut-switch__thumb" aria-hidden="true" />
        </button>
      </div>
      <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13, margin: "8px 0 0" }}>
        {t("settings.keepNetworkImageLinksHint")}
      </p>
    </div>
  );
}
