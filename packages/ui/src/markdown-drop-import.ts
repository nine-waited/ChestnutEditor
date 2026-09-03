import { useEffect } from "react";
import { isMarkdown } from "@chestnut/core";
import { isTauri, listenOsFileDrop } from "@chestnut/storage-adapters";
import { getT } from "./i18n/index.js";
import { importAndOpenDroppedMarkdownFiles } from "./markdown-bundle-import.js";
import { useAppStore } from "./store.js";

export type ExplorerMarkdownDrop =
  | { kind: "markdown"; paths: string[] }
  | { kind: "reject" }
  | { kind: "empty" };

/** OS file-manager drops: only `.md` files are accepted. */
export function classifyExplorerFileDrop(paths: string[]): ExplorerMarkdownDrop {
  const cleaned = paths.map((path) => path.trim()).filter(Boolean);
  if (cleaned.length === 0) return { kind: "empty" };
  if (cleaned.every((path) => isMarkdown(path))) return { kind: "markdown", paths: cleaned };
  return { kind: "reject" };
}

export function droppedPathsFromDataTransfer(data: DataTransfer | null): string[] {
  if (!data) return [];
  const paths: string[] = [];
  for (const file of data.files) {
    const path = (file as File & { path?: string }).path?.trim();
    if (path) paths.push(path);
  }
  return paths;
}

let lastDropKey = "";
let lastDropAt = 0;
let importInFlight = false;

function shouldHandleDrop(paths: string[]): boolean {
  const key = paths.map((path) => path.replace(/\\/g, "/").toLowerCase()).sort().join("|");
  const now = Date.now();
  if (key === lastDropKey && now - lastDropAt < 800) return false;
  lastDropKey = key;
  lastDropAt = now;
  return true;
}

export async function handleExplorerMarkdownDrop(paths: string[]): Promise<void> {
  const classified = classifyExplorerFileDrop(paths);
  const t = getT();
  const setStatusText = useAppStore.getState().setStatusText;

  if (classified.kind === "empty") return;
  if (classified.kind === "reject") {
    setStatusText(t("status.importMarkdownDropOnlyMd"));
    return;
  }
  if (!shouldHandleDrop(classified.paths) || importInFlight) return;
  if (!useAppStore.getState().vaultMounted) {
    setStatusText(t("status.importMarkdownDropNeedsVault"));
    return;
  }

  importInFlight = true;
  try {
    await importAndOpenDroppedMarkdownFiles(classified.paths);
  } catch (err) {
    console.error("[Chestnut] drop-import markdown failed:", err);
    setStatusText(t("status.importMarkdownFailed"));
  } finally {
    importInFlight = false;
  }
}

export function useMarkdownFileDropImport(): void {
  useEffect(() => {
    if (!isTauri()) return;

    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (event: DragEvent) => {
      const paths = droppedPathsFromDataTransfer(event.dataTransfer);
      if (paths.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      void handleExplorerMarkdownDrop(paths);
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop, true);

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenOsFileDrop((paths) => {
      void handleExplorerMarkdownDrop(paths);
    })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((err) => {
        console.error("[Chestnut] listen file drop failed:", err);
      });

    return () => {
      cancelled = true;
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop, true);
      unlisten?.();
    };
  }, []);
}
