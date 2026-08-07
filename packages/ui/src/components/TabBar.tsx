import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PaneId } from "@chestnut/core";
import { useT } from "../i18n/index.js";
import { useAppStore, workspaceStore } from "../store.js";
import { ExcalidrawGrayIcon, ImageGrayIcon, MarkdownGrayIcon, PdfGrayIcon } from "../icons/sidebar-icons.js";
import { focusMainContent, isFileContentTab } from "../focus-main-content.js";
import { createAndOpenNote } from "../note-actions.js";
import {
  requestCloseAllTabs,
  requestCloseOtherTabs,
  requestCloseTab,
  requestCloseTabsToLeft,
  requestCloseTabsToRight,
} from "../tab-close.js";
import {
  getNoteUnsavedSnapshot,
  isNoteUnsaved,
  subscribeNoteUnsaved,
} from "../unsaved-notes.js";
import {
  attachFileTreeDragGhost,
  detachFileTreeDragGhost,
  moveFileTreeDragGhost,
} from "../file-tree-drag-ghost.js";
import {
  FILE_TREE_DRAG_LONG_PRESS_MS,
  FILE_TREE_DRAG_MOVE_PX,
} from "../file-tree-pointer-dnd.js";
import { ContextMenuFrame } from "./ContextMenuFrame.js";

/** Right fraction of the editor area that triggers enter-split when dropping a tab. */
const SPLIT_DROP_ZONE_RATIO = 0.28;

type TabDragSession = {
  leafId: string;
  fromPane: PaneId;
  pointerId: number;
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  sourceElement: HTMLElement;
  active: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
};

function findDropPaneId(clientX: number, clientY: number): PaneId | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el || !(el instanceof Element)) return null;
  const host = el.closest<HTMLElement>(".boke-editor-pane[data-pane], .boke-tabs[data-pane]");
  const id = host?.getAttribute("data-pane");
  if (id === "left" || id === "right") return id;
  return null;
}

function isInSplitDropZone(clientX: number, clientY: number): boolean {
  const area = document.querySelector(".boke-editor-area");
  if (!(area instanceof HTMLElement)) return false;
  const rect = area.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return false;
  }
  return clientX >= rect.right - rect.width * SPLIT_DROP_ZONE_RATIO;
}

function setTabDropTarget(paneId: PaneId | null): void {
  document.querySelectorAll(".boke-editor-pane.is-tab-drop-target").forEach((node) => {
    node.classList.remove("is-tab-drop-target");
  });
  if (!paneId) return;
  document
    .querySelector(`.boke-editor-pane[data-pane="${paneId}"]`)
    ?.classList.add("is-tab-drop-target");
}

function setSplitDropHint(active: boolean, label = ""): void {
  const area = document.querySelector(".boke-editor-area");
  if (!(area instanceof HTMLElement)) return;
  let hint = area.querySelector(".boke-split-drop-hint");
  if (!active) {
    area.classList.remove("is-split-drop-hint");
    hint?.remove();
    return;
  }
  area.classList.add("is-split-drop-hint");
  if (!(hint instanceof HTMLElement)) {
    hint = document.createElement("div");
    hint.className = "boke-split-drop-hint";
    hint.setAttribute("aria-live", "polite");
    area.appendChild(hint);
  }
  hint.textContent = label;
}

function clearTabDragFeedback(): void {
  setTabDropTarget(null);
  setSplitDropHint(false);
}

function TabContextMenu({
  paneId,
  tabId,
  tabIndex,
  tabCount,
  onClose,
}: {
  paneId: PaneId;
  tabId: string;
  tabIndex: number;
  tabCount: number;
  onClose: () => void;
}) {
  const t = useT();

  const run = (action: () => void) => {
    onClose();
    action();
  };

  const leaf = workspaceStore.getState().panes[paneId].leaves.find((l) => l.id === tabId);
  const canCloseThis = !(tabCount === 1 && leaf?.type === "empty");
  const canCloseOthers = tabCount > 1;
  const canCloseLeft = tabIndex > 0;
  const canCloseRight = tabIndex >= 0 && tabIndex < tabCount - 1;

  const item = (label: string, disabled: boolean, action: () => void) => (
    <button
      type="button"
      className={`boke-context-menu-item${disabled ? " boke-context-menu-item--disabled" : ""}`}
      onClick={() => {
        if (disabled) return;
        run(action);
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      {item(t("tab.close"), !canCloseThis, () => void requestCloseTab(tabId))}
      {item(t("tab.closeOthers"), !canCloseOthers, () => void requestCloseOtherTabs(tabId))}
      {item(t("tab.closeToLeft"), !canCloseLeft, () => void requestCloseTabsToLeft(tabId))}
      {item(t("tab.closeToRight"), !canCloseRight, () => void requestCloseTabsToRight(tabId))}
      {item(t("tab.closeAll"), !canCloseThis, () => void requestCloseAllTabs(paneId))}
    </>
  );
}

export function TabBar({ paneId = "left" }: { paneId?: PaneId }) {
  const t = useT();
  const tabsRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<TabDragSession | null>(null);
  const suppressClickRef = useRef(false);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const syncOutlineDefaultsForSplit = useAppStore((s) => s.syncOutlineDefaultsForSplit);
  const markdownSaveMode = useAppStore((s) => s.markdownSaveMode);
  const unsavedKey = useSyncExternalStore(subscribeNoteUnsaved, getNoteUnsavedSnapshot);
  const state = useSyncExternalStore(
    (cb) => workspaceStore.subscribe(cb),
    () => workspaceStore.getState(),
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
    tabIndex: number;
  } | null>(null);
  const [draggingLeafId, setDraggingLeafId] = useState<string | null>(null);

  const pane = state.panes[paneId];
  const visibleLeaves = pane.leaves.filter((leaf) => leaf.type !== "empty");
  const isFocused = !state.split || state.focusedPane === paneId;

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;

      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;

      event.preventDefault();
      el.scrollLeft += delta;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [visibleLeaves.length]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (session?.longPressTimer) clearTimeout(session.longPressTimer);
      sessionRef.current = null;
      detachFileTreeDragGhost();
      document.body.classList.remove("boke-tab-dragging");
      clearTabDragFeedback();
    };
  }, []);

  const label = (leaf: (typeof pane.leaves)[0]) => {
    switch (leaf.type) {
      case "markdown":
        return leaf.path?.split("/").pop() ?? t("tab.note");
      case "excalidraw":
        return leaf.path?.split("/").pop() ?? t("tab.drawing");
      case "image":
        return leaf.path?.split("/").pop() ?? t("tab.image");
      case "pdf":
        return leaf.path?.split("/").pop() ?? t("tab.pdf");
      case "graph":
        return t("tab.graph");
      case "settings":
        return t("tab.settings");
      case "publish":
        return t("tab.publish");
      default:
        return t("tab.note");
    }
  };

  const openContextMenu = (event: MouseEvent, tabId: string, tabIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    workspaceStore.setActive(tabId);
    setContextMenu({ x: event.clientX, y: event.clientY, tabId, tabIndex });
  };

  const endDrag = useCallback(() => {
    sessionRef.current = null;
    setDraggingLeafId(null);
    detachFileTreeDragGhost();
    document.body.classList.remove("boke-tab-dragging");
    clearTabDragFeedback();
  }, []);

  const updateDragFeedback = useCallback(
    (session: TabDragSession, clientX: number, clientY: number, isSplit: boolean) => {
      if (isSplit) {
        setSplitDropHint(false);
        const dropPane = findDropPaneId(clientX, clientY);
        setTabDropTarget(dropPane && dropPane !== session.fromPane ? dropPane : null);
        return;
      }
      setTabDropTarget(null);
      setSplitDropHint(isInSplitDropZone(clientX, clientY), t("tab.splitDropHint"));
    },
    [t],
  );

  const beginDrag = useCallback(
    (session: TabDragSession, clientX: number, clientY: number, isSplit: boolean) => {
      session.active = true;
      setDraggingLeafId(session.leafId);
      attachFileTreeDragGhost(session.sourceElement, clientX, clientY);
      document.body.classList.add("boke-tab-dragging");
      updateDragFeedback(session, clientX, clientY, isSplit);
    },
    [updateDragFeedback],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, leafId: string) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest(".boke-tab-close")) return;
      if (sessionRef.current) return;

      const isSplit = workspaceStore.isSplit();
      const sourceElement = event.currentTarget;
      const session: TabDragSession = {
        leafId,
        fromPane: paneId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        sourceElement,
        active: false,
        longPressTimer: null,
      };
      sessionRef.current = session;

      session.longPressTimer = setTimeout(() => {
        if (sessionRef.current !== session || session.active) return;
        beginDrag(session, session.lastClientX, session.lastClientY, isSplit);
      }, FILE_TREE_DRAG_LONG_PRESS_MS);

      const finish = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== session.pointerId) return;
        if (session.longPressTimer) {
          clearTimeout(session.longPressTimer);
          session.longPressTimer = null;
        }
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);

        if (session.active) {
          const dropX = ev.clientX;
          const dropY = ev.clientY;
          const stillSplit = workspaceStore.isSplit();
          endDrag();
          suppressClickRef.current = true;
          if (stillSplit) {
            const dropPane = findDropPaneId(dropX, dropY);
            if (dropPane && dropPane !== session.fromPane) {
              workspaceStore.moveLeafToPane(session.leafId, dropPane);
            }
          } else if (isInSplitDropZone(dropX, dropY)) {
            if (workspaceStore.splitWithLeaf(session.leafId)) {
              syncOutlineDefaultsForSplit(true);
            }
          }
        } else {
          sessionRef.current = null;
        }
      };

      const onMove = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== session.pointerId) return;
        session.lastClientX = ev.clientX;
        session.lastClientY = ev.clientY;
        if (!session.active) {
          const dx = ev.clientX - session.startX;
          const dy = ev.clientY - session.startY;
          if (Math.hypot(dx, dy) >= FILE_TREE_DRAG_MOVE_PX) {
            if (session.longPressTimer) {
              clearTimeout(session.longPressTimer);
              session.longPressTimer = null;
            }
            beginDrag(session, ev.clientX, ev.clientY, isSplit);
          }
          return;
        }

        ev.preventDefault();
        moveFileTreeDragGhost(ev.clientX, ev.clientY);
        updateDragFeedback(session, ev.clientX, ev.clientY, isSplit);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
    },
    [beginDrag, endDrag, paneId, syncOutlineDefaultsForSplit, updateDragFeedback],
  );

  return (
    <>
      <div
        className={`boke-tabs${isFocused ? " is-focused-pane" : ""}`}
        ref={tabsRef}
        data-pane={paneId}
        onMouseDown={() => workspaceStore.setFocusedPane(paneId)}
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest(".boke-tab")) return;
          event.preventDefault();
          workspaceStore.setFocusedPane(paneId);
          void createAndOpenNote();
        }}
      >
        {visibleLeaves.map((leaf, index) => (
          <div
            key={leaf.id}
            className={[
              "boke-tab",
              leaf.id === pane.activeId ? "active" : "",
              contextMenu?.tabId === leaf.id ? "context-target" : "",
              draggingLeafId === leaf.id ? "is-dragging" : "",
              "is-draggable",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerDown={(e) => handlePointerDown(e, leaf.id)}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              workspaceStore.setActive(leaf.id);
              if (isFileContentTab(leaf.type)) focusMainContent(paneId);
            }}
            onDoubleClick={() => {
              if (!isFileContentTab(leaf.type)) return;
              workspaceStore.setActive(leaf.id);
              const nextCollapsed = !sidebarCollapsed;
              setSidebarCollapsed(nextCollapsed);
              focusMainContent(paneId);
            }}
            onContextMenu={(e) => openContextMenu(e, leaf.id, index)}
          >
            {leaf.type === "markdown" && (
              <span className="boke-tab-icon boke-tab-icon--markdown" aria-hidden="true">
                <MarkdownGrayIcon />
              </span>
            )}
            {leaf.type === "excalidraw" && (
              <span className="boke-tab-icon boke-tab-icon--excalidraw" aria-hidden="true">
                <ExcalidrawGrayIcon />
              </span>
            )}
            {leaf.type === "image" && (
              <span className="boke-tab-icon boke-tab-icon--image" aria-hidden="true">
                <ImageGrayIcon />
              </span>
            )}
            {leaf.type === "pdf" && (
              <span className="boke-tab-icon boke-tab-icon--pdf" aria-hidden="true">
                <PdfGrayIcon />
              </span>
            )}
            {label(leaf)}
            {markdownSaveMode === "interval" &&
              unsavedKey.length > 0 &&
              leaf.type === "markdown" &&
              isNoteUnsaved(leaf.path) && (
                <span
                  className="boke-tab-unsaved-dot"
                  aria-label={t("tab.unsavedAria")}
                  title={t("tab.unsavedAria")}
                />
              )}
            <button
              className="boke-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                void requestCloseTab(leaf.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {contextMenu && (
        <ContextMenuFrame
          x={contextMenu.x}
          y={contextMenu.y}
          className="boke-context-menu boke-context-menu--tab"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <TabContextMenu
            paneId={paneId}
            tabId={contextMenu.tabId}
            tabIndex={contextMenu.tabIndex}
            tabCount={visibleLeaves.length}
            onClose={() => setContextMenu(null)}
          />
        </ContextMenuFrame>
      )}
    </>
  );
}
