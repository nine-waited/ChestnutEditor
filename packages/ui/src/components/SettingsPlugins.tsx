import { useEffect, useState } from "react";
import { useT } from "../i18n/index.js";
import { pluginHost, useAppStore } from "../store.js";
import type { PluginManifest } from "@chestnut/plugin-sdk";

export function SettingsPlugins() {
  const t = useT();
  const enabledPlugins = useAppStore((s) => s.enabledPlugins);
  const installedPlugins = useAppStore((s) => s.installedPlugins);
  const togglePluginEnabled = useAppStore((s) => s.togglePluginEnabled);
  const vaultMounted = useAppStore((s) => s.vaultMounted);
  const [listed, setListed] = useState<PluginManifest[]>(installedPlugins);

  useEffect(() => {
    setListed(installedPlugins);
  }, [installedPlugins]);

  useEffect(() => {
    if (!vaultMounted) return;
    void pluginHost.listInstalled().then(setListed);
  }, [vaultMounted]);

  return (
    <>
      <h3>{t("settings.plugins")}</h3>
      <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.pluginsHint")}</p>
      {listed.length === 0 ? (
        <p style={{ color: "var(--boke-text-muted)", fontSize: 13 }}>{t("settings.pluginsEmpty")}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
          {listed.map((plugin) => {
            const enabled = enabledPlugins.includes(plugin.id);
            return (
              <li key={plugin.id} style={{ marginBottom: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => {
                      void togglePluginEnabled(plugin.id, event.target.checked);
                    }}
                  />
                  <span>
                    <strong>{plugin.name}</strong>
                    {plugin.description ? (
                      <span style={{ color: "var(--boke-text-muted)", marginLeft: 8 }}>
                        {plugin.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
