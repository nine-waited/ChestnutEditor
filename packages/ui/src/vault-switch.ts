import type { VaultAdapter } from "@chestnut/core";
import { workspaceStore } from "@chestnut/core";
import { flushAllNoteWriters } from "./note-reload-registry.js";
import { clearSourceEditorHistory } from "./source-editor-history-cache.js";
import { editorPaneLru } from "./store.js";
import { fileTreeSelection } from "./file-tree-selection.js";
import { clearAllNoteUnsaved } from "./unsaved-notes.js";
import { normalizeVaultPathInput } from "./vault-path-utils.js";

function adapterVaultRoot(adapter: VaultAdapter): string | null {
  if (adapter.kind !== "tauri" || !("getRootPath" in adapter)) return null;
  return normalizeVaultPathInput((adapter as { getRootPath(): string }).getRootPath());
}

export function isVaultRootSwitch(next: VaultAdapter, currentPath: string | null): boolean {
  const nextRoot = adapterVaultRoot(next);
  if (!nextRoot) return false;
  const currentRoot = currentPath ? normalizeVaultPathInput(currentPath) : null;
  return nextRoot !== currentRoot;
}

/** Save open editors, then clear tabs and editor caches before mounting another vault. */
export async function prepareWorkspaceForVaultSwitch(): Promise<void> {
  await flushAllNoteWriters();
  workspaceStore.resetWorkspaceTabs();
  clearAllNoteUnsaved();
  editorPaneLru.clear();
  clearSourceEditorHistory();
  fileTreeSelection.clear();
  await import("./vault-external-sync.js").then((mod) => mod.stopVaultFsWatch());
}
