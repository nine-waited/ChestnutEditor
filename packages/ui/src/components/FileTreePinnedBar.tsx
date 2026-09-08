import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { fileBaseName, isExcalidraw, isMarkdown } from "@chestnut/core";
import { ExcalidrawGrayIcon, MarkdownGrayIcon } from "../icons/sidebar-icons.js";
import { useT } from "../i18n/index.js";
import { openVaultEntry } from "../vault-entry-open.js";
import { useAppStore, workspaceStore } from "../store.js";
import {
  attachFileTreeDragGhost,
  detachFileTreeDragGhost,
  moveFileTreeDragGhost,
} from "../file-tree-drag-ghost.js";
import {
  FILE_TREE_DRAG_LONG_PRESS_MS,
  FILE_TREE_DRAG_MOVE_PX,
} from "../file-tree-pointer-dnd.js";
import { reorderPinnedFilePaths as computeReorder } from "../file-tree-pinned.js";
import { fileTreeSelection } from "../file-tree-selection.js";
import { revealFileInTree, revealFileInTreeWhenReady } from "../file-tree-expand-context.js";
import { ContextMenuFrame } from "./ContextMenuFrame.js";

const PINNED_PATH_ATTR = "data-pinned-path";
const PINNABLE_DRAG_BODY_CLASS = "chestnut-file-tree-dragging-pinnable";

function subscribePinnableTreeDrag(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function isPinnableTreeDragActive(): boolean {
  return document.body.classList.contains(PINNABLE_DRAG_BODY_CLASS);
}

function PinnedFileIcon({ path }: { path: string }) {
  if (isExcalidraw(path)) {
    return (
      <span className="chestnut-file-tree-icon chestnut-file-tree-icon--excalidraw" aria-hidden="true">
        <ExcalidrawGrayIcon />
      </span>
    );
  }
  if (isMarkdown(path)) {
    return (
      <span className="chestnut-file-tree-icon chestnut-file-tree-icon--markdown" aria-hidden="true">
        <MarkdownGrayIcon />
      </span>
    );
  }
  return null;
}

/** Insert-before index from pointer Y: top half → before item, bottom half → after. */
function findPinnedInsertBeforeIndex(clientY: number, paths: string[]): number {
  const items = Array.from(document.querySelectorAll<HTMLElement>(`[${PINNED_PATH_ATTR}]`));
  for (const el of items) {
    const path = el.getAttribute(PINNED_PATH_ATTR);
    if (!path) continue;
    const index = paths.indexOf(path);
    if (index < 0) continue;
    const rect = el.getBoundingClientRect();
    if (clientY < rect.top) return index;
    if (clientY <= rect.bottom) {
      const mid = rect.top + rect.height / 2;
      return clientY < mid ? index : index + 1;
    }
  }
  return paths.length;
}

interface PinnedDragSession {
  path: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastClientX: number;
  lastClientY: number;
  sourceElement: HTMLElement;
  active: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
}

export function FileTreePinnedBar() {
  const t = useT();
  const pinnedFilePaths = useAppStore((s) => s.pinnedFilePaths);
  const unpinFilePaths = useAppStore((s) => s.unpinFilePaths);
  const reorderPinnedFilePaths = useAppStore((s) => s.reorderPinnedFilePaths);
  const activePath = useSyncExternalStore(
    (cb) => workspaceStore.subscribe(cb),
    () => workspaceStore.getActivePath(),
  );
  const [menu, setMenu] = useState<{ x: number; y: number; paths: string[] } | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [anchorPath, setAnchorPath] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [insertBeforeIndex, setInsertBeforeIndex] = useState<number | null>(null);
  const sessionRef = useRef<PinnedDragSession | null>(null);
  const pathsRef = useRef(pinnedFilePaths);
  const selectedRef = useRef(selectedPaths);
  const suppressClickRef = useRef(false);

  pathsRef.current = pinnedFilePaths;
  selectedRef.current = selectedPaths;

  useEffect(() => {
    setSelectedPaths((prev) => {
      const next = prev.filter((path) => pinnedFilePaths.includes(path));
      return next.length === prev.length ? prev : next;
    });
    setAnchorPath((prev) => (prev && pinnedFilePaths.includes(prev) ? prev : null));
  }, [pinnedFilePaths]);

  // Selecting / opening another file outside the pinned selection clears pin highlight.
  useEffect(() => {
    if (!activePath) return;
    if (selectedPaths.length === 0 || selectedPaths.includes(activePath)) return;
    setSelectedPaths([]);
    setAnchorPath(null);
  }, [activePath, selectedPaths]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const endDrag = useCallback(() => {
    sessionRef.current = null;
    setDraggingPath(null);
    setInsertBeforeIndex(null);
    detachFileTreeDragGhost();
    document.body.classList.remove("chestnut-file-tree-pinned-dragging");
  }, []);

  const beginDrag = useCallback((session: PinnedDragSession, clientX: number, clientY: number) => {
    session.active = true;
    setDraggingPath(session.path);
    attachFileTreeDragGhost(session.sourceElement, clientX, clientY);
    document.body.classList.add("chestnut-file-tree-pinned-dragging");
    setInsertBeforeIndex(findPinnedInsertBeforeIndex(clientY, pathsRef.current));
  }, []);

  const selectExclusive = useCallback((path: string) => {
    setSelectedPaths([path]);
    setAnchorPath(path);
  }, []);

  const toggleSelect = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      if (prev.includes(path)) {
        const next = prev.filter((item) => item !== path);
        setAnchorPath(next[0] ?? null);
        return next;
      }
      setAnchorPath(path);
      return [...prev, path];
    });
  }, []);

  const selectRangeTo = useCallback(
    (path: string) => {
      const order = pathsRef.current;
      const anchor = anchorPath && order.includes(anchorPath) ? anchorPath : path;
      const from = order.indexOf(anchor);
      const to = order.indexOf(path);
      if (from < 0 || to < 0) {
        selectExclusive(path);
        return;
      }
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      setSelectedPaths(order.slice(lo, hi + 1));
      if (!anchorPath) setAnchorPath(path);
    },
    [anchorPath, selectExclusive],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>, path: string) => {
      if (event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (sessionRef.current) return;

      const sourceElement = event.currentTarget;
      const session: PinnedDragSession = {
        path,
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

      // Same activation as the file tree: long-press, or move past the drag threshold.
      session.longPressTimer = setTimeout(() => {
        if (sessionRef.current !== session || session.active) return;
        beginDrag(session, session.lastClientX, session.lastClientY);
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
          const index = findPinnedInsertBeforeIndex(ev.clientY, pathsRef.current);
          const next = computeReorder(pathsRef.current, session.path, index);
          const changed = next.join("\0") !== pathsRef.current.join("\0");
          endDrag();
          suppressClickRef.current = true;
          if (changed) reorderPinnedFilePaths(session.path, index);
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
            beginDrag(session, ev.clientX, ev.clientY);
          }
          return;
        }

        ev.preventDefault();
        moveFileTreeDragGhost(ev.clientX, ev.clientY);
        setInsertBeforeIndex(findPinnedInsertBeforeIndex(ev.clientY, pathsRef.current));
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", finish);
      document.addEventListener("pointercancel", finish);
    },
    [beginDrag, endDrag, reorderPinnedFilePaths],
  );

  const dropTargetActive =
    draggingPath !== null &&
    insertBeforeIndex !== null &&
    computeReorder(pinnedFilePaths, draggingPath, insertBeforeIndex).join("\0") !==
      pinnedFilePaths.join("\0");

  const hasSelection = selectedPaths.length > 0;
  const pinnableTreeDragActive = useSyncExternalStore(
    subscribePinnableTreeDrag,
    isPinnableTreeDragActive,
    () => false,
  );

  if (pinnedFilePaths.length === 0 && !pinnableTreeDragActive) return null;

  const openMenu = (event: MouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();
    const current = selectedRef.current;
    const paths =
      current.length > 1 && current.includes(path)
        ? pinnedFilePaths.filter((item) => current.includes(item))
        : [path];
    if (!(current.length > 1 && current.includes(path))) {
      selectExclusive(path);
    }
    setMenu({ x: event.clientX, y: event.clientY, paths });
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>, path: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
      selectRangeTo(path);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      toggleSelect(path);
      return;
    }
    selectExclusive(path);
    fileTreeSelection.selectExclusive(path, "file");
    openVaultEntry(path);
    revealFileInTree(path);
    void revealFileInTreeWhenReady(path);
  };

  return (
    <>
      <div
        className="chestnut-file-tree-pinned"
        aria-label={t("fileTree.pinned")}
        data-file-tree-pin-drop=""
      >
        <div className="chestnut-file-tree-pinned-label">{t("fileTree.pinned")}</div>
        {pinnedFilePaths.length > 0 && (
          <ul className="chestnut-file-tree-pinned-list">
            {pinnedFilePaths.map((path, index) => {
              const name = fileBaseName(path);
              const selected = selectedPaths.includes(path);
              const highlighted = selected || (!hasSelection && activePath === path);
              const isDragging = draggingPath === path;
              const dropBefore = dropTargetActive && insertBeforeIndex === index;
              const dropAfter =
                dropTargetActive &&
                insertBeforeIndex === pinnedFilePaths.length &&
                index === pinnedFilePaths.length - 1;
              return (
                <li key={path} className="chestnut-file-tree-pinned-row">
                  <button
                    type="button"
                    className={[
                      "chestnut-file-tree-pinned-item",
                      highlighted ? "is-active" : "",
                      isDragging ? "is-dragging" : "",
                      dropBefore ? "is-drop-before" : "",
                      dropAfter ? "is-drop-after" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    title={path}
                    data-pinned-path={path}
                    onClick={(event) => handleClick(event, path)}
                    onContextMenu={(event) => openMenu(event, path)}
                    onPointerDown={(event) => handlePointerDown(event, path)}
                  >
                    <PinnedFileIcon path={path} />
                    <span className="chestnut-file-tree-pinned-name">{name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {menu && (
        <ContextMenuFrame x={menu.x} y={menu.y}>
          {menu.paths.length === 1 && (
            <button
              type="button"
              className="chestnut-context-menu-item"
              onClick={() => {
                const path = menu.paths[0]!;
                reorderPinnedFilePaths(path, 0);
                setMenu(null);
              }}
            >
              {t("fileTree.pin")}
            </button>
          )}
          <button
            type="button"
            className="chestnut-context-menu-item"
            onClick={() => {
              unpinFilePaths(menu.paths);
              setSelectedPaths([]);
              setAnchorPath(null);
              setMenu(null);
            }}
          >
            {t("fileTree.unpin")}
          </button>
        </ContextMenuFrame>
      )}
    </>
  );
}
