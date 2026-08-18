import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { requestRefreshMarkdownTab } from "../note-reload.js";
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
import {
  clearTabDragFeedback,
  findDropPaneId,
  findTabReorderTarget,
  getTabInsertIndicator,
  isInSplitDropZone,
  isPointOverTabStrip,
  setSplitDropHint,
  setTabDropTarget,
  setTabInsertIndicator,
  subscribeTabInsertIndicator,
} from "../tab-drop-zone.js";
import {
  capturePendingTabFlip,
  findTabInsertBeforeFromLayout,
  playTabStripFlip,
  snapshotTabStripLayout,
  takePendingTabFlip,
  visualTabOrderKey,
  visualTabsForInsert,
  type TabStripLayoutItem,
} from "../tab-reorder-motion.js";
import { ContextMenuFrame } from "./ContextMenuFrame.js";

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
  layout: TabStripLayoutItem[] | null;
};

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
  const canRefresh = leaf?.type === "markdown" && Boolean(leaf.path);

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
      {canRefresh
        ? item(t("tab.refresh"), false, () => void requestRefreshMarkdownTab(tabId, paneId))
        : null}
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
  const insertIndicator = useSyncExternalStore(subscribeTabInsertIndicator, getTabInsertIndicator);

  const pane = state.panes[paneId];
  const visibleLeaves = pane.leaves.filter((leaf) => leaf.type !== "empty");
  const isFocused = !state.split || state.focusedPane === paneId;
  const insertForPane = insertIndicator?.paneId === paneId ? insertIndicator : null;
  const visualItems = visualTabsForInsert(visibleLeaves, insertForPane, draggingLeafId);
  const visualOrderKey = visualTabOrderKey(visualItems);
  const reordering = Boolean(draggingLeafId || insertForPane);

  const captureFlipFirst = useCallback(() => {
    capturePendingTabFlip(tabsRef.current);
  }, []);

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

  useLayoutEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    playTabStripFlip(strip, takePendingTabFlip());
  }, [visualOrderKey]);

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
      const strip = tabsRef.current;
      const reorder =
        session.layout && strip && isPointOverTabStrip(clientX, clientY, session.fromPane)
          ? findTabInsertBeforeFromLayout(clientX, strip, session.layout, session.leafId)
          : session.layout
            ? null
            : findTabReorderTarget(clientX, clientY, session.fromPane, session.leafId);
      if (reorder) {
        captureFlipFirst();
        setTabDropTarget(null);
        setSplitDropHint(false);
        setTabInsertIndicator({
          paneId: session.fromPane,
          insertBeforeId: reorder.insertBeforeId,
          excludeLeafId: session.leafId,
        });
        return;
      }
      captureFlipFirst();
      setTabInsertIndicator(null);
      if (isSplit) {
        setSplitDropHint(false);
        const dropPane = findDropPaneId(clientX, clientY);
        setTabDropTarget(dropPane && dropPane !== session.fromPane ? dropPane : null);
        return;
      }
      setTabDropTarget(null);
      setSplitDropHint(isInSplitDropZone(clientX, clientY), t("tab.splitDropHint"));
    },
    [captureFlipFirst, t],
  );

  const beginDrag = useCallback(
    (session: TabDragSession, clientX: number, clientY: number, isSplit: boolean) => {
      session.active = true;
      session.layout = tabsRef.current ? snapshotTabStripLayout(tabsRef.current) : null;
      captureFlipFirst();
      setDraggingLeafId(session.leafId);
      attachFileTreeDragGhost(session.sourceElement, clientX, clientY);
      document.body.classList.add("boke-tab-dragging");
      updateDragFeedback(session, clientX, clientY, isSplit);
    },
    [captureFlipFirst, updateDragFeedback],
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
        layout: null,
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
          const strip = tabsRef.current;
          const reorder =
            session.layout && strip && isPointOverTabStrip(dropX, dropY, session.fromPane)
              ? findTabInsertBeforeFromLayout(dropX, strip, session.layout, session.leafId)
              : findTabReorderTarget(dropX, dropY, session.fromPane, session.leafId);
          captureFlipFirst();
          if (stillSplit) {
            const dropPane = findDropPaneId(dropX, dropY);
            if (dropPane && dropPane !== session.fromPane) {
              endDrag();
              suppressClickRef.current = true;
              workspaceStore.moveLeafToPane(session.leafId, dropPane);
              return;
            }
          } else if (!reorder && isInSplitDropZone(dropX, dropY)) {
            endDrag();
            suppressClickRef.current = true;
            if (workspaceStore.splitWithLeaf(session.leafId)) {
              syncOutlineDefaultsForSplit(true);
            }
            return;
          }
          if (reorder) {
            workspaceStore.reorderLeaf(session.leafId, reorder.insertBeforeId);
          }
          endDrag();
          suppressClickRef.current = true;
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
    [beginDrag, captureFlipFirst, endDrag, paneId, syncOutlineDefaultsForSplit, updateDragFeedback],
  );

  return (
    <>
      <div
        className={`boke-tabs${isFocused ? " is-focused-pane" : ""}${reordering ? " is-reordering" : ""}`}
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
        {visualItems.map((item) =>
          item.type === "slot" ? (
            <div key="__drop-slot__" className="boke-tab-drop-slot" aria-hidden="true" />
          ) : (
          <div
            key={item.leaf.id}
            data-leaf-id={item.leaf.id}
            className={[
              "boke-tab",
              item.leaf.id === pane.activeId ? "active" : "",
              contextMenu?.tabId === item.leaf.id ? "context-target" : "",
              draggingLeafId === item.leaf.id ? "is-dragging" : "",
              "is-draggable",
            ]
              .filter(Boolean)
              .join(" ")}
            onPointerDown={(e) => handlePointerDown(e, item.leaf.id)}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              workspaceStore.setActive(item.leaf.id);
              if (isFileContentTab(item.leaf.type)) focusMainContent(paneId);
            }}
            onDoubleClick={() => {
              if (!isFileContentTab(item.leaf.type)) return;
              workspaceStore.setActive(item.leaf.id);
              const nextCollapsed = !sidebarCollapsed;
              setSidebarCollapsed(nextCollapsed);
              focusMainContent(paneId);
            }}
            onContextMenu={(e) =>
              openContextMenu(
                e,
                item.leaf.id,
                visibleLeaves.findIndex((entry) => entry.id === item.leaf.id),
              )
            }
          >
            {item.leaf.type === "markdown" && (
              <span className="boke-tab-icon boke-tab-icon--markdown" aria-hidden="true">
                <MarkdownGrayIcon />
              </span>
            )}
            {item.leaf.type === "excalidraw" && (
              <span className="boke-tab-icon boke-tab-icon--excalidraw" aria-hidden="true">
                <ExcalidrawGrayIcon />
              </span>
            )}
            {item.leaf.type === "image" && (
              <span className="boke-tab-icon boke-tab-icon--image" aria-hidden="true">
                <ImageGrayIcon />
              </span>
            )}
            {item.leaf.type === "pdf" && (
              <span className="boke-tab-icon boke-tab-icon--pdf" aria-hidden="true">
                <PdfGrayIcon />
              </span>
            )}
            {label(item.leaf)}
            {markdownSaveMode === "interval" &&
              unsavedKey.length > 0 &&
              (item.leaf.type === "markdown" || item.leaf.type === "excalidraw") &&
              !item.leaf.viewOnly &&
              isNoteUnsaved(item.leaf.path) && (
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
                void requestCloseTab(item.leaf.id);
              }}
            >
              ×
            </button>
          </div>
          ),
        )}
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
