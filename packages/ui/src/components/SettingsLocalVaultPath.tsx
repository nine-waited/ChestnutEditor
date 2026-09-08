import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { isTauri, TauriFsAdapter } from "@chestnut/storage-adapters";
import {
  normalizeVaultPathInput,
  resolveVaultDisplayPath,
} from "../vault-path-utils.js";
import { useT } from "../i18n/index.js";
import { useAppStore } from "../store.js";
import { VaultPathPickButton } from "./VaultPathPickButton.js";

export function SettingsLocalVaultPath() {
  const t = useT();
  const vaultKind = useAppStore((s) => s.vaultKind);
  const localVaultPath = useAppStore((s) => s.localVaultPath);
  const mountVault = useAppStore((s) => s.mountVault);
  const setStatusText = useAppStore((s) => s.setStatusText);

  const displayPath = resolveVaultDisplayPath(localVaultPath, vaultKind);
  const [draft, setDraft] = useState(displayPath);
  const committingRef = useRef(false);

  useEffect(() => {
    setDraft(displayPath);
  }, [displayPath]);

  const commit = useCallback(async () => {
    if (committingRef.current) return;
    committingRef.current = true;

    try {
      const trimmed = draft.trim();
      if (!trimmed) {
        await mountVault(await TauriFsAdapter.default());
        return;
      }

      const normalized = normalizeVaultPathInput(trimmed);
      const current = localVaultPath ? normalizeVaultPathInput(localVaultPath) : "";
      if (normalized === current) return;

      await mountVault(await TauriFsAdapter.open(normalized));
    } catch (err) {
      console.error("[Chestnut] vault path change failed:", err);
      setStatusText(t("status.vaultPathInvalid"));
      setDraft(displayPath);
    } finally {
      committingRef.current = false;
    }
  }, [draft, displayPath, localVaultPath, mountVault, setStatusText, t]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      setDraft(displayPath);
      e.currentTarget.blur();
    }
  };

  if (!isTauri()) {
    return (
      <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>{t("vault.desktopOnly")}</p>
    );
  }

  return (
    <div className="chestnut-settings-vault-path-row">
      <input
        className="chestnut-settings-vault-path-input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        spellCheck={false}
        aria-label={t("vault.pathAria")}
        placeholder={t("vault.pathPlaceholder")}
      />
      <VaultPathPickButton
        className="chestnut-settings-vault-path-pick"
        onError={setStatusText}
      />
    </div>
  );
}
