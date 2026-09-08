import type { ReactNode } from "react";
import { isTauri, TauriFsAdapter } from "@chestnut/storage-adapters";
import { resolveVaultDisplayPath, isPickCancelled } from "../vault-path-utils.js";
import { useT } from "../i18n/index.js";
import { toolbarPathGroupStyle } from "../toolbar-path-layout.js";
import { useAppStore } from "../store.js";
import { VaultPathCopyButton } from "./VaultPathCopyButton.js";

function VaultPathGroup({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="chestnut-toolbar-path-group" style={toolbarPathGroupStyle()}>
      {children}
      <VaultPathCopyButton className="chestnut-toolbar-path-reveal" path={path} />
    </div>
  );
}

export function ToolbarVaultPath() {
  const t = useT();
  const vaultKind = useAppStore((s) => s.vaultKind);
  const localVaultPath = useAppStore((s) => s.localVaultPath);
  const remoteConfig = useAppStore((s) => s.remoteConfig);
  const mountVault = useAppStore((s) => s.mountVault);
  const setStatusText = useAppStore((s) => s.setStatusText);

  const displayPath = resolveVaultDisplayPath(localVaultPath, vaultKind);

  const pickFolder = async () => {
    try {
      const adapter = await TauriFsAdapter.pick(displayPath || undefined);
      await mountVault(adapter);
    } catch (err) {
      if (isPickCancelled(err)) return;
      console.error("[Chestnut] pick vault folder failed:", err);
      setStatusText(t("status.pickFolderFailed"));
    }
  };

  if (vaultKind === "remote" && remoteConfig) {
    const remotePath = remoteConfig.vaultPath ?? "default";
    return (
      <span className="chestnut-toolbar-path chestnut-toolbar-path--readonly" title={remotePath}>
        {remotePath}
      </span>
    );
  }

  if (vaultKind !== "tauri" || !isTauri() || !displayPath) {
    return null;
  }

  return (
    <VaultPathGroup path={displayPath}>
      <button
        type="button"
        className="chestnut-toolbar-path"
        title={t("toolbar.vaultPathPickHint", { path: displayPath })}
        aria-label={t("toolbar.pickFolderAria")}
        onClick={() => void pickFolder()}
      >
        {displayPath}
      </button>
    </VaultPathGroup>
  );
}
