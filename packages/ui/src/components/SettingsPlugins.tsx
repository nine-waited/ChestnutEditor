import { useEffect, useMemo, useState } from "react";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { confirmAction } from "../confirm-dialog.js";
import {
  downloadAppPlugin,
  formatPluginDownloadProgress,
  listenPluginDownloadProgress,
  type PluginDownloadProgress,
} from "../app-plugins.js";
import {
  DOWNLOADABLE_PLUGINS,
  PLUGIN_DOWNLOAD_BYTES,
  isDownloadablePluginId,
  type DownloadablePluginId,
} from "../downloadable-plugins.js";

export function SettingsPlugins() {
  const t = useT();
  const enabledPlugins = useAppStore((s) => s.enabledPlugins);
  const installedPlugins = useAppStore((s) => s.installedPlugins);
  const setActivePlugin = useAppStore((s) => s.setActivePlugin);
  const uninstallAppPlugin = useAppStore((s) => s.uninstallAppPlugin);
  const refreshInstalledPlugins = useAppStore((s) => s.refreshInstalledPlugins);
  const [listed, setListed] = useState(installedPlugins);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [progress, setProgress] = useState<Partial<Record<string, PluginDownloadProgress>>>({});
  const activeId = enabledPlugins[0] ?? null;

  useEffect(() => {
    setListed(installedPlugins);
  }, [installedPlugins]);

  useEffect(() => {
    void refreshInstalledPlugins();
  }, [refreshInstalledPlugins]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenPluginDownloadProgress((payload) => {
      if (cancelled || !isDownloadablePluginId(payload.id)) return;
      setProgress((prev) => ({ ...prev, [payload.id]: payload }));
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const installedById = useMemo(() => new Map(listed.map((plugin) => [plugin.id, plugin])), [listed]);
  const extras = listed.filter((plugin) => !isDownloadablePluginId(plugin.id));

  function setPluginBusy(id: string, on: boolean) {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearError(id: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function selectPlugin(id: string, installed: boolean) {
    if (busy.has(id) || !installed) return;
    await setActivePlugin(id === activeId ? null : id);
    clearError(id);
  }

  async function download(id: DownloadablePluginId) {
    if (busy.has(id)) return;
    setPluginBusy(id, true);
    clearError(id);
    setProgress((prev) => ({
      ...prev,
      [id]: { id, received: 0, total: PLUGIN_DOWNLOAD_BYTES[id] },
    }));
    try {
      await downloadAppPlugin(id);
      await refreshInstalledPlugins();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: t("settings.pluginsDownloadFailed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      }));
    } finally {
      setPluginBusy(id, false);
      setProgress((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function uninstall(plugin: { id: string; name: string }) {
    if (busy.has(plugin.id)) return;
    const ok = await confirmAction({
      title: t("settings.pluginsUninstallTitle"),
      message: t("settings.pluginsUninstallMessage", { name: plugin.name }),
      confirmLabel: t("settings.pluginsUninstall"),
      danger: true,
    });
    if (!ok) return;
    setPluginBusy(plugin.id, true);
    clearError(plugin.id);
    try {
      await uninstallAppPlugin(plugin.id);
      await refreshInstalledPlugins();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [plugin.id]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setPluginBusy(plugin.id, false);
    }
  }

  return (
    <>
      <h3>{t("settings.plugins")}</h3>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.pluginsHint")}</p>
      <ul className="boke-plugin-list" role="radiogroup" aria-label={t("settings.plugins")}>
        {DOWNLOADABLE_PLUGINS.map((item) => {
          const installed = installedById.get(item.id);
          const name = installed?.name ?? t(item.nameKey);
          return (
            <PluginRow
              key={item.id}
              name={name}
              description={t(item.descKey)}
              checked={item.id === activeId}
              installed={Boolean(installed)}
              downloadable
              busy={busy.has(item.id)}
              error={errors[item.id]}
              downloadProgress={progress[item.id]}
              onSelect={() => {
                void selectPlugin(item.id, Boolean(installed));
              }}
              onDownload={() => {
                void download(item.id);
              }}
              onUninstall={() => {
                void uninstall({ id: item.id, name });
              }}
            />
          );
        })}
        {extras.map((plugin) => (
          <PluginRow
            key={plugin.id}
            name={plugin.name}
            description={plugin.description}
            checked={plugin.id === activeId}
            installed
            downloadable={false}
            busy={busy.has(plugin.id)}
            error={errors[plugin.id]}
            onSelect={() => {
              void selectPlugin(plugin.id, true);
            }}
            onUninstall={() => {
              void uninstall(plugin);
            }}
          />
        ))}
      </ul>
    </>
  );
}

function PluginRow({
  name,
  description,
  checked,
  installed,
  downloadable,
  busy,
  error,
  downloadProgress,
  onSelect,
  onDownload,
  onUninstall,
}: {
  name: string;
  description?: string;
  checked: boolean;
  installed: boolean;
  downloadable: boolean;
  busy: boolean;
  error?: string;
  downloadProgress?: PluginDownloadProgress;
  onSelect: () => void;
  onDownload?: () => void;
  onUninstall: () => void;
}) {
  const t = useT();
  const status = downloadable
    ? busy && !installed
      ? t("settings.pluginsDownloading")
      : installed
        ? t("settings.pluginsInstalled")
        : t("settings.pluginsNotInstalled")
    : description;
  return (
    <li className="boke-plugin-row">
      <button
        type="button"
        className="boke-plugin-item"
        role="radio"
        aria-checked={checked}
        disabled={busy || !installed}
        onClick={onSelect}
      >
        <span className="boke-plugin-item-mark" aria-hidden />
        <span className="boke-plugin-item-text">
          <strong>{name}</strong>
          {status ? <span className="boke-plugin-item-desc">{status}</span> : null}
          {downloadable && description ? (
            <span className="boke-plugin-item-desc">{description}</span>
          ) : null}
          {error ? <span className="boke-plugin-item-error">{error}</span> : null}
        </span>
        {downloadProgress ? (
          <span className="boke-plugin-item-progress">
            {formatPluginDownloadProgress(downloadProgress.received, downloadProgress.total)}
          </span>
        ) : null}
      </button>
      {downloadable && !installed ? (
        <button
          type="button"
          className="boke-plugin-action"
          disabled={busy}
          onClick={onDownload}
        >
          {busy ? t("settings.pluginsDownloading") : t("settings.pluginsDownload")}
        </button>
      ) : (
        <button
          type="button"
          className="boke-plugin-action boke-plugin-action--danger"
          disabled={busy}
          onClick={onUninstall}
        >
          {t("settings.pluginsUninstall")}
        </button>
      )}
    </li>
  );
}
