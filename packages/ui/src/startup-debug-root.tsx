import { useCallback, useSyncExternalStore } from "react";
import {
  closeStartupDebugPanel,
  copyStartupLogs,
  formatStartupLogSnapshot,
  getStartupDebugUiSnapshot,
  logStartup,
  patchSavedVaultPath,
  reloadAfterVaultPathChange,
  subscribeStartupDebug,
} from "./startup-debug.js";

function zh(): boolean {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh");
}

export function StartupDebugRoot() {
  const state = useSyncExternalStore(
    subscribeStartupDebug,
    getStartupDebugUiSnapshot,
    getStartupDebugUiSnapshot,
  );
  const copy = useCallback(() => {
    void copyStartupLogs().then((ok) => {
      logStartup(ok ? "debug: copied logs" : "debug: copy logs failed", undefined, ok ? "info" : "warn");
    });
  }, []);

  const resetPath = useCallback(() => {
    patchSavedVaultPath(null);
    logStartup("debug: cleared saved vault path, reloading");
    reloadAfterVaultPathChange();
  }, []);

  const pickPath = useCallback(() => {
    void (async () => {
      try {
        const { pickFolder } = await import("@chestnut/storage-adapters");
        const path = await pickFolder(state.vaultPath ?? undefined);
        patchSavedVaultPath(path);
        logStartup("debug: saved new vault path, reloading", path);
        reloadAfterVaultPathChange();
      } catch (err) {
        if (String(err).includes("cancelled")) return;
        logStartup("debug: pick vault failed", String(err), "error");
      }
    })();
  }, [state.vaultPath]);

  const cn = zh();

  return (
    <div className="boke-startup-debug" data-chestnut-debug-host="">
      {state.open ? (
        <div className="boke-startup-debug-overlay" role="dialog" aria-modal="true" aria-label="startup debug">
          <div className="boke-startup-debug-panel">
            <header className="boke-startup-debug-header">
              <strong>{cn ? "启动调试日志" : "Startup debug log"}</strong>
              <button type="button" onClick={() => closeStartupDebugPanel()}>
                {cn ? "关闭" : "Close"}
              </button>
            </header>
            <p className="boke-startup-debug-meta">
              {cn ? "已保存知识库路径" : "Saved vault path"}: {state.vaultPath || (cn ? "（默认 ~/.chestnut）" : "(default ~/.chestnut)")}
            </p>
            <div className="boke-startup-debug-actions">
              <button type="button" onClick={copy}>
                {cn ? "复制全部日志" : "Copy all logs"}
              </button>
              <button type="button" onClick={pickPath}>
                {cn ? "另选知识库并重载" : "Pick another vault and reload"}
              </button>
              <button type="button" onClick={resetPath}>
                {cn ? "清除路径并重载默认库" : "Clear path and reload default"}
              </button>
            </div>
            <pre className="boke-startup-debug-log">
              {state.previous
                ? `=== previous boot ===\n${formatStartupLogSnapshot(state.previous)}\n\n=== current boot ===\n${formatStartupLogSnapshot(state.current)}`
                : formatStartupLogSnapshot(state.current)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
