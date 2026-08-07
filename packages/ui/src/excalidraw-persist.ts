import { restore, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState, AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

function emptyScene(): ExcalidrawInitialDataState {
  return {
    elements: [],
    appState: { viewBackgroundColor: "#1e1e2e" },
    files: {},
  };
}

function isImportedScene(data: unknown): data is Pick<ImportedDataState, "appState" | "elements" | "files"> {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return record.type === "excalidraw" || "elements" in record || "appState" in record;
}

function stripCorruptedAppStateFields(data: Pick<ImportedDataState, "appState" | "elements" | "files">) {
  if (!data.appState || typeof data.appState !== "object") return;
  const appState = data.appState as Record<string, unknown>;
  // Map fields survive JSON as plain objects and crash Excalidraw on reload.
  if (appState.collaborators != null && !(appState.collaborators instanceof Map)) {
    delete appState.collaborators;
  }
}

/** Parse vault file content into Excalidraw-ready initial data. */
export function parseExcalidrawFile(raw: string): ExcalidrawInitialDataState {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isImportedScene(parsed)) {
      return emptyScene();
    }
    stripCorruptedAppStateFields(parsed);
    return restore(parsed, null, null);
  } catch {
    return emptyScene();
  }
}

/** Serialize scene for vault storage using Excalidraw's export sanitizer. */
export function serializeExcalidrawScene(
  elements: readonly unknown[],
  appState: unknown,
  files: unknown,
): string {
  return serializeAsJSON(
    elements as OrderedExcalidrawElement[],
    appState as Partial<AppState>,
    files as BinaryFiles,
    "local",
  );
}
