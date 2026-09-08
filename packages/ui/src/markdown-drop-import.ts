import { useEffect } from "react";
import { isMarkdown, isZip } from "@chestnut/core";
import { isTauri, listenOsFileDrop } from "@chestnut/storage-adapters";
import { getT } from "./i18n/index.js";
import { importAndOpenDroppedSources } from "./markdown-bundle-import.js";
import { useAppStore } from "./store.js";

export type ExplorerFileDrop =
  | { kind: "import"; markdown: string[]; zip: string[] }
  | { kind: "reject" }
  | { kind: "empty" };

/** @deprecated Use ExplorerFileDrop */
export type ExplorerMarkdownDrop = ExplorerFileDrop;

/** OS file-manager drops: Markdown notes and exported ZIP archives. */
export function classifyExplorerFileDrop(paths: string[]): ExplorerFileDrop {
  const cleaned = paths.map((path) => path.trim()).filter(Boolean);
  if (cleaned.length === 0) return { kind: "empty" };
  const markdown = cleaned.filter((path) => isMarkdown(path));
  const zip = cleaned.filter((path) => isZip(path));
  if (markdown.length + zip.length !== cleaned.length) return { kind: "reject" };
  return { kind: "import", markdown, zip };
}

export function pathFromDroppedUri(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) return trimmed;
  if (!/^file:/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "file:") return null;
    let path = decodeURIComponent(url.pathname);
    if (/^\/[a-zA-Z]:/.test(path)) path = path.slice(1);
    return path || null;
  } catch {
    return null;
  }
}

export function droppedPathsFromDataTransfer(data: DataTransfer | null): string[] {
  if (!data) return [];
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (path: string | null | undefined) => {
    const trimmed = path?.trim();
    if (!trimmed) return;
    const key = trimmed.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    paths.push(trimmed);
  };

  for (const file of data.files) {
    add((file as File & { path?: string }).path);
  }
  const uriList = data.getData("text/uri-list") || data.getData("text/plain");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) add(pathFromDroppedUri(line));
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
  const dropKey = [...classified.markdown, ...classified.zip];
  if (!shouldHandleDrop(dropKey) || importInFlight) return;
  if (!useAppStore.getState().vaultMounted) {
    setStatusText(t("status.importMarkdownDropNeedsVault"));
    return;
  }

  importInFlight = true;
  try {
    await importAndOpenDroppedSources(classified.markdown, classified.zip);
  } catch (err) {
    console.error("[Chestnut] drop-import failed:", err);
    const failedZip = classified.zip.length > 0 && classified.markdown.length === 0;
    setStatusText(t(failedZip ? "status.importZipFailed" : "status.importMarkdownFailed"));
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
      if (!event.dataTransfer?.types.includes("Files")) return;
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
