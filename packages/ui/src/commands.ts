import { commandRegistry, workspaceStore } from "./store.js";
import { createAndOpenDrawing, createAndOpenNote } from "./note-actions.js";
import { getT } from "./i18n/index.js";

export function toggleCurrentMarkdownSourceMode(): void {
  const state = workspaceStore.getState();
  const leaf = state.panes[state.focusedPane].active ?? state.active;
  if (leaf?.type !== "markdown" || !leaf.path) return;
  const next = leaf.mode === "source" ? "live" : "source";
  workspaceStore.setMode(leaf.id, next);
}

export function registerCoreCommands(): void {
  const t = getT();

  commandRegistry.register({
    id: "chestnut:new-note",
    name: t("commands.newNote"),
    category: t("commands.category"),
    callback: async () => {
      await createAndOpenNote();
    },
  });

  commandRegistry.register({
    id: "chestnut:new-drawing",
    name: t("commands.newDrawing"),
    category: t("commands.category"),
    callback: async () => {
      await createAndOpenDrawing();
    },
  });

  commandRegistry.register({
    id: "chestnut:open-graph",
    name: t("commands.openGraph"),
    category: t("commands.category"),
    callback: () => {
      workspaceStore.openGraph();
    },
  });

  commandRegistry.register({
    id: "chestnut:open-settings",
    name: t("commands.openSettings"),
    category: t("commands.category"),
    callback: () => {
      workspaceStore.openSettings();
    },
  });

  commandRegistry.register({
    id: "chestnut:open-publish",
    name: t("commands.openPublish"),
    category: t("commands.category"),
    callback: () => {
      workspaceStore.openPublish();
    },
  });

  commandRegistry.register({
    id: "chestnut:toggle-source",
    name: t("commands.toggleSource"),
    category: t("commands.category"),
    callback: () => {
      toggleCurrentMarkdownSourceMode();
    },
  });
}
