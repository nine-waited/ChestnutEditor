import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

const TOOLBAR_UI_SELECTOR =
  ".milkdown-toolbar, .boke-md-table-toolbar, .boke-note-image-toolbar, .boke-note-image-lightbox";
const LIVE_EDITOR_CHROME_SELECTOR = ".boke-live-editor-inner, [data-milkdown-root], .milkdown";

export function isFormatToolbarUiTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(TOOLBAR_UI_SELECTOR));
}

/** Padding / empty chrome around the document, not the ProseMirror contents. */
export function isLiveEditorBlankChrome(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (isFormatToolbarUiTarget(target)) return false;
  if (target.closest(".ProseMirror")) return false;
  return Boolean(target.closest(LIVE_EDITOR_CHROME_SELECTOR));
}

export function shouldCollapseFormatToolbarOnFocusOut(input: {
  relatedTarget: EventTarget | null;
  editorEl: { contains(node: Node): boolean };
  toolbar: { contains(node: Node): boolean } | null;
}): boolean {
  const next = input.relatedTarget;
  if (next && typeof next === "object") {
    const node = next as Node;
    if (input.editorEl.contains(node)) return false;
    if (input.toolbar?.contains(node)) return false;
  }
  return true;
}

export function collapseEditorTextSelection(view: EditorView): boolean {
  const { selection, doc } = view.state;
  if (!(selection instanceof TextSelection) || selection.empty) return false;
  const pos = Math.min(Math.max(selection.head, 0), doc.content.size);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos)).setMeta("addToHistory", false));
  return true;
}

function hideCrepeFormatToolbar(scope: ParentNode): void {
  for (const el of scope.querySelectorAll<HTMLElement>(".milkdown-toolbar")) {
    if (el.dataset.show !== "false") el.dataset.show = "false";
  }
}

export function attachDismissFormatToolbar(
  editorEl: HTMLElement,
  getView: () => EditorView | null,
): () => void {
  const wrap = editorEl.closest(".boke-milkdown-wrap") ?? editorEl.parentElement;
  if (!wrap) return () => {};

  const dismiss = () => {
    const view = getView();
    if (view) collapseEditorTextSelection(view);
    hideCrepeFormatToolbar(wrap);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!isLiveEditorBlankChrome(event.target)) return;
    dismiss();
  };

  const onFocusOut = (event: FocusEvent) => {
    const toolbar = wrap.querySelector(".milkdown-toolbar");
    if (
      !shouldCollapseFormatToolbarOnFocusOut({
        relatedTarget: event.relatedTarget,
        editorEl,
        toolbar,
      })
    ) {
      return;
    }
    requestAnimationFrame(() => {
      if (viewHasFocusOrToolbar(editorEl, wrap)) return;
      dismiss();
    });
  };

  wrap.addEventListener("pointerdown", onPointerDown);
  editorEl.addEventListener("focusout", onFocusOut);
  return () => {
    wrap.removeEventListener("pointerdown", onPointerDown);
    editorEl.removeEventListener("focusout", onFocusOut);
  };
}

function viewHasFocusOrToolbar(editorEl: HTMLElement, wrap: Element): boolean {
  const active = document.activeElement;
  if (active && editorEl.contains(active)) return true;
  const toolbar = wrap.querySelector(".milkdown-toolbar");
  return Boolean(active && toolbar?.contains(active));
}
