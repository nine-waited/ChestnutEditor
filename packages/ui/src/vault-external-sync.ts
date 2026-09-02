import {
  eventBus,
  isHiddenPath,
  isMarkdown,
  normalizePath,
  planExternalDiskSync,
  vaultService,
} from "@chestnut/core";
import { emitNoteReload, getNoteWriteSnapshot } from "./note-reload-registry.js";
import { isTauri, unwatchVaultFolder, watchVaultFolder } from "@chestnut/storage-adapters";

const debounceTimers = new Map<string, number>();
let watching = false;
let unlistenFs: (() => void) | null = null;
let unsubBus: (() => void) | null = null;

async function refreshTree(): Promise<void> {
  const { useAppStore } = await import("./store.js");
  useAppStore.getState().refreshTree();
}

export async function applyExternalDiskChange(path: string): Promise<"ignore" | "reload" | "conflict"> {
  const normalized = normalizePath(path);
  if (!normalized || isHiddenPath(normalized)) return "ignore";

  if (!isMarkdown(normalized)) {
    await refreshTree();
    return "ignore";
  }

  let disk: string;
  try {
    disk = await vaultService.read(normalized);
  } catch {
    await refreshTree();
    return "ignore";
  }

  const snapshot = getNoteWriteSnapshot(normalized);
  const plan = planExternalDiskSync({
    buffer: snapshot?.buffer,
    lastSaved: snapshot?.lastSaved,
    disk,
  });

  if (plan === "ignore") return "ignore";

  vaultService.discardPendingWrite(normalized);

  if (plan === "reload") {
    vaultService.rememberLoaded(normalized, disk);
    emitNoteReload(normalized);
    await refreshTree();
    return "reload";
  }

  return "conflict";
}

export function scheduleExternalDiskChange(path: string): void {
  const normalized = normalizePath(path);
  const prev = debounceTimers.get(normalized);
  if (prev) window.clearTimeout(prev);
  debounceTimers.set(
    normalized,
    window.setTimeout(() => {
      debounceTimers.delete(normalized);
      void applyExternalDiskChange(normalized);
    }, 200),
  );
}

export function ensureExternalChangeListener(): void {
  if (unsubBus) return;
  unsubBus = eventBus.on("file-external-change", ({ path }) => {
    scheduleExternalDiskChange(path);
  });
}

export async function startVaultFsWatch(rootPath: string): Promise<void> {
  ensureExternalChangeListener();
  if (!isTauri()) return;
  await stopVaultFsWatch();
  watching = true;
  await watchVaultFolder(rootPath);
  const { listen } = await import(/* @vite-ignore */ "@tauri-apps/api/event");
  unlistenFs = await listen<{ path: string }>("vault-fs-change", (event) => {
    scheduleExternalDiskChange(event.payload.path);
  });
}

export async function stopVaultFsWatch(): Promise<void> {
  for (const timer of debounceTimers.values()) window.clearTimeout(timer);
  debounceTimers.clear();
  unlistenFs?.();
  unlistenFs = null;
  if (watching) {
    watching = false;
    try {
      await unwatchVaultFolder();
    } catch {
      /* ignore */
    }
  }
}
