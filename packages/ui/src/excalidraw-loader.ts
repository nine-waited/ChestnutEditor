let excalidrawModulePromise: Promise<typeof import("@excalidraw/excalidraw")> | null = null;

/** Load Excalidraw runtime + CSS once; shared by view and persist helpers. */
export function loadExcalidrawModule(): Promise<typeof import("@excalidraw/excalidraw")> {
  if (!excalidrawModulePromise) {
    excalidrawModulePromise = Promise.all([
      import("@excalidraw/excalidraw"),
      import("@excalidraw/excalidraw/index.css"),
    ]).then(([mod]) => mod);
  }
  return excalidrawModulePromise;
}
