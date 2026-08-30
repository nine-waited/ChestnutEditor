import { useEffect, useState } from "react";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { confirmAction } from "../confirm-dialog.js";
import { getAppPluginsPath, pickAndInstallAppPluginZip, pickZipFile } from "../app-plugins.js";
import { filesFromDataTransfer } from "../plugin-import.js";

export function SettingsPlugins() {
  const t = useT();
  const enabledPlugins = useAppStore((s) => s.enabledPlugins);
  const installedPlugins = useAppStore((s) => s.installedPlugins);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const importAppPlugin = useAppStore((s) => s.importAppPlugin);
  const uninstallAppPlugin = useAppStore((s) => s.uninstallAppPlugin);
  const refreshInstalledPlugins = useAppStore((s) => s.refreshInstalledPlugins);
  const [listed, setListed] = useState(installedPlugins);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pluginsPath, setPluginsPath] = useState("");
  const activeId = enabledPlugins[0] ?? null;

  useEffect(() => {
    setListed(installedPlugins);
  }, [installedPlugins]);

  useEffect(() => {
    void refreshInstalledPlugins();
    void getAppPluginsPath()
      .then(setPluginsPath)
      .catch(() => setPluginsPath(""));
  }, [refreshInstalledPlugins]);

  async function importZip(file: File | null) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      await importAppPlugin(file);
      await refreshInstalledPlugins();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === "PLUGIN_ZIP_USE_PICKER" ? t("settings.pluginsZipUsePicker") : msg);
    } finally {
      setBusy(false);
    }
  }

  async function pickZip() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const manifest = await pickAndInstallAppPluginZip();
      if (!manifest) return;
      await refreshInstalledPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function uninstall(plugin: { id: string; name: string }) {
    if (busy) return;
    const ok = await confirmAction({
      title: t("settings.pluginsUninstallTitle"),
      message: t("settings.pluginsUninstallMessage", { name: plugin.name }),
      confirmLabel: t("settings.pluginsUninstall"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await uninstallAppPlugin(plugin.id);
      await refreshInstalledPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3>{t("settings.plugins")}</h3>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.pluginsHint")}</p>
      {pluginsPath ? (
        <p style={{ color: "var(--boke-text-muted)", fontSize: 12, wordBreak: "break-all" }}>
          {t("settings.pluginsPath", { path: pluginsPath })}
        </p>
      ) : null}
      <div
        className={`boke-plugin-drop${over ? " is-over" : ""}${busy ? " is-disabled" : ""}`}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        onClick={() => {
          if (!busy) void pickZip();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!busy) void pickZip();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void filesFromDataTransfer(event.dataTransfer).then((files) => {
            const zip = pickZipFile(files);
            if (!zip) {
              setError(t("settings.pluginsNeedZip"));
              return;
            }
            void importZip(zip);
          });
        }}
      >
        <strong>{t("settings.pluginsDrop")}</strong>
        <span>{t("settings.pluginsDropHint")}</span>
      </div>
      {error ? <p className="boke-plugin-import-error">{error}</p> : null}
      {listed.length === 0 ? (
        <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.pluginsEmpty")}</p>
      ) : (
        <ul className="boke-plugin-list" role="radiogroup" aria-label={t("settings.plugins")}>
          {listed.map((plugin) => {
            const checked = plugin.id === activeId;
            return (
              <li key={plugin.id} className="boke-plugin-row">
                <button
                  type="button"
                  className="boke-plugin-item"
                  role="radio"
                  aria-checked={checked}
                  disabled={busy}
                  onClick={() => {
                    void setActivePlugin(plugin.id);
                  }}
                >
                  <span className="boke-plugin-item-mark" aria-hidden />
                  <span>
                    <strong>{plugin.name}</strong>
                    {plugin.description ? (
                      <span className="boke-plugin-item-desc">{plugin.description}</span>
                    ) : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="boke-plugin-uninstall"
                  disabled={busy}
                  onClick={() => {
                    void uninstall(plugin);
                  }}
                >
                  {t("settings.pluginsUninstall")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
