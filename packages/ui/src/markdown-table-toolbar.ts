import type { Ctx } from "@milkdown/ctx";
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { CellSelection, cellAround, isInTable } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getT } from "./i18n/index.js";
import {
  placeTableCellCaret,
  placeTableCellCaretFromPos,
  runTableMenuOp,
  tableElementFromView,
  type TableMenuOp,
} from "./markdown-table-ops.js";

export const TABLE_TOOLBAR_CLASS = "boke-md-table-toolbar";
const TOOLBAR_MIN_VISIBLE = 8;

export interface TableToolbarRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Keep the overlay inside the live editor clip; null if the table is scrolled away. */
export function tableToolbarBox(
  table: TableToolbarRect,
  clip: TableToolbarRect,
  toolbarHeight: number,
): { left: number; top: number; width: number } | null {
  const left = Math.max(table.left, clip.left);
  const right = Math.min(table.right, clip.right);
  const visibleTop = Math.max(table.top, clip.top);
  const visibleBottom = Math.min(table.bottom, clip.bottom);
  const width = right - left;
  const visibleHeight = visibleBottom - visibleTop;
  if (width < TOOLBAR_MIN_VISIBLE || visibleHeight < toolbarHeight) return null;

  let top = table.top - toolbarHeight;
  if (top < clip.top) top = clip.top;
  if (top + toolbarHeight > clip.bottom) return null;
  return { left, top, width };
}

function editorClipElement(table: HTMLElement): HTMLElement | null {
  return table.closest(".boke-live-scroll") ?? table.closest(".boke-milkdown-wrap");
}

/** Host next to the table so keep-alive / page switches hide the overlay with the pane. */
export function tableToolbarHost(table: HTMLElement, viewDom?: HTMLElement | null): HTMLElement | null {
  return (
    editorClipElement(table) ??
    viewDom?.closest(".boke-live-scroll") ??
    viewDom?.closest(".boke-milkdown-wrap") ??
    null
  );
}

export function tableToolbarHostIsLiveFromAncestors(input: {
  connected: boolean;
  hiddenAncestor: boolean;
  paneSlotActive: boolean | null;
  modeSlotActive: boolean | null;
}): boolean {
  if (!input.connected || input.hiddenAncestor) return false;
  if (input.paneSlotActive === false) return false;
  if (input.modeSlotActive === false) return false;
  return true;
}

export function tableToolbarHostIsLive(host: HTMLElement): boolean {
  const pane = host.closest(".boke-note-pane-slot");
  const mode = host.closest(".boke-note-mode-slot");
  return tableToolbarHostIsLiveFromAncestors({
    connected: host.isConnected,
    hiddenAncestor: Boolean(host.closest("[hidden]")),
    paneSlotActive: pane ? pane.classList.contains("is-active") : null,
    modeSlotActive: mode ? mode.classList.contains("is-active") : null,
  });
}

export function tableToolbarShouldShow(input: {
  editable: boolean;
  inTable: boolean;
  tableConnected: boolean;
  host: HTMLElement | null;
  hostLive: boolean;
}): boolean {
  return Boolean(input.editable && input.inTable && input.tableConnected && input.host && input.hostLive);
}

type ToolbarButton = { op: TableMenuOp; titleKey: string; icon: string } | { sep: true };

const ICON_ROW_ABOVE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 11h3v10h2V11h3l-4-4-4 4zM4 3v2h16V3H4z"/></svg>';
const ICON_ROW_BELOW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 13h-3V3h-2v10H8l4 4 4-4zM4 19v2h16v-2H4z"/></svg>';
const ICON_DELETE_ROW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>';
const ICON_COL_LEFT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.41 16.59 13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z"/></svg>';
const ICON_COL_RIGHT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.59 7.41 10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/></svg>';
const ICON_DELETE_COL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 11v2h10v-2H7zm5-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>';
const ICON_ALIGN_LEFT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>';
const ICON_ALIGN_CENTER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>';
const ICON_ALIGN_RIGHT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>';
const ICON_DELETE_TABLE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 19.1H3V5h18v14.1zM21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><path fill="currentColor" d="M14.59 8 12 10.59 9.41 8 8 9.41 10.59 12 8 14.59 9.41 16 12 13.41 14.59 16 16 14.59 13.41 12 16 9.41z"/></svg>';
const ICON_SUM =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.5 4H7.3L13 12 7.3 20h11.2v2H5.2v-1.7L12.2 12 5.2 3.7V2h13.3v2z"/></svg>';
const ICON_AVERAGE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16v2H4V4zm3.1 5h2.5l2.1 6.4L14.1 9h2.5l-3.6 10h-2.4L7.1 9z"/></svg>';

const BUTTONS: ToolbarButton[] = [
  { op: "rowBefore", titleKey: "note.tableToolbarRowAbove", icon: ICON_ROW_ABOVE },
  { op: "rowAfter", titleKey: "note.tableToolbarRowBelow", icon: ICON_ROW_BELOW },
  { op: "deleteRow", titleKey: "note.tableToolbarDeleteRow", icon: ICON_DELETE_ROW },
  { sep: true },
  { op: "colBefore", titleKey: "note.tableToolbarColLeft", icon: ICON_COL_LEFT },
  { op: "colAfter", titleKey: "note.tableToolbarColRight", icon: ICON_COL_RIGHT },
  { op: "deleteCol", titleKey: "note.tableToolbarDeleteCol", icon: ICON_DELETE_COL },
  { sep: true },
  { op: "alignLeft", titleKey: "note.tableToolbarAlignLeft", icon: ICON_ALIGN_LEFT },
  { op: "alignCenter", titleKey: "note.tableToolbarAlignCenter", icon: ICON_ALIGN_CENTER },
  { op: "alignRight", titleKey: "note.tableToolbarAlignRight", icon: ICON_ALIGN_RIGHT },
  { sep: true },
  { op: "sum", titleKey: "note.tableToolbarSum", icon: ICON_SUM },
  { op: "average", titleKey: "note.tableToolbarAverage", icon: ICON_AVERAGE },
  { sep: true },
  { op: "deleteTable", titleKey: "note.tableToolbarDeleteTable", icon: ICON_DELETE_TABLE },
];

function createToolbar(ctx: Ctx): HTMLDivElement {
  const toolbar = document.createElement("div");
  toolbar.className = TABLE_TOOLBAR_CLASS;
  toolbar.contentEditable = "false";
  toolbar.draggable = false;
  toolbar.hidden = true;

  for (const item of BUTTONS) {
    if ("sep" in item) {
      const sep = document.createElement("span");
      sep.className = `${TABLE_TOOLBAR_CLASS}__sep`;
      sep.setAttribute("aria-hidden", "true");
      toolbar.appendChild(sep);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${TABLE_TOOLBAR_CLASS}__btn`;
    button.dataset.op = item.op;
    button.dataset.titleKey = item.titleKey;
    button.innerHTML = item.icon;
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      runTableMenuOp(ctx, item.op);
    });
    toolbar.appendChild(button);
  }

  const t = getT();
  toolbar.querySelectorAll<HTMLButtonElement>("button[data-title-key]").forEach((button) => {
    const key = button.dataset.titleKey;
    if (!key) return;
    const title = t(key);
    button.title = title;
    button.setAttribute("aria-label", title);
  });
  return toolbar;
}

class TableOverlayToolbarView {
  private readonly toolbar: HTMLDivElement;
  private table: HTMLTableElement | null = null;
  private view: EditorView | null = null;
  private stopObserve: (() => void) | null = null;
  private readonly onReposition = (): void => {
    this.reposition();
  };

  constructor(ctx: Ctx) {
    this.toolbar = createToolbar(ctx);
    window.addEventListener("scroll", this.onReposition, true);
    window.addEventListener("resize", this.onReposition);
  }

  update(view: EditorView): void {
    this.view = view;
    this.observeHosts(view.dom);
    const inTable = view.editable && isInTable(view.state);
    const table = inTable ? tableElementFromView(view) : null;
    const host = table?.isConnected ? tableToolbarHost(table, view.dom) : null;
    const hostLive = Boolean(host && tableToolbarHostIsLive(host));
    if (
      !tableToolbarShouldShow({
        editable: view.editable,
        inTable,
        tableConnected: Boolean(table?.isConnected),
        host,
        hostLive,
      }) ||
      !table ||
      !host
    ) {
      this.hide();
      return;
    }
    if (this.toolbar.parentElement !== host) {
      host.appendChild(this.toolbar);
    }
    this.table = table;
    this.toolbar.hidden = false;
    this.reposition();
  }

  destroy(): void {
    window.removeEventListener("scroll", this.onReposition, true);
    window.removeEventListener("resize", this.onReposition);
    this.stopObserve?.();
    this.stopObserve = null;
    this.view = null;
    this.hide();
  }

  private observeHosts(dom: HTMLElement): void {
    if (this.stopObserve) return;
    const targets = [
      dom.closest(".boke-note-pane-slot"),
      dom.closest(".boke-note-mode-slot"),
      dom.closest(".boke-markdown-shell"),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement);
    if (targets.length === 0) return;
    const observer = new MutationObserver(() => {
      if (this.view) this.update(this.view);
    });
    for (const el of targets) {
      observer.observe(el, { attributes: true, attributeFilter: ["class", "hidden", "aria-hidden"] });
    }
    this.stopObserve = () => observer.disconnect();
  }

  private hide(): void {
    this.table = null;
    this.toolbar.hidden = true;
    this.toolbar.classList.remove("is-clipped");
    this.toolbar.style.visibility = "";
    this.toolbar.style.pointerEvents = "";
    this.toolbar.remove();
  }

  private reposition(): void {
    if (this.toolbar.hidden || !this.table) return;
    if (!this.table.isConnected) {
      this.hide();
      return;
    }
    const clipEl = editorClipElement(this.table);
    const tableRect = this.table.getBoundingClientRect();
    const clipRect = clipEl?.getBoundingClientRect();
    const height = this.toolbar.offsetHeight || 32;
    const box = clipRect
      ? tableToolbarBox(tableRect, clipRect, height)
      : { left: tableRect.left, top: tableRect.top - height, width: tableRect.width };
    if (!box) {
      this.toolbar.classList.add("is-clipped");
      return;
    }
    this.toolbar.classList.remove("is-clipped");
    this.toolbar.style.left = `${Math.round(box.left)}px`;
    this.toolbar.style.top = `${Math.round(box.top)}px`;
    this.toolbar.style.width = `${Math.round(box.width)}px`;
  }
}

export const tableToolbarPlugin = $prose((ctx) => {
  return new Plugin({
    key: new PluginKey("chestnut-table-toolbar"),
    view: () => new TableOverlayToolbarView(ctx),
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          return placeTableCellCaret(view, event);
        },
      },
      handleClick(view, pos, event) {
        if (event.shiftKey) return false;
        if (view.state.selection instanceof CellSelection) {
          return Boolean(cellAround(view.state.doc.resolve(pos)));
        }
        return placeTableCellCaretFromPos(view, pos);
      },
    },
  });
});
