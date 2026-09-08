import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getT } from "./i18n/index.js";

const BUTTON_CLASS = "chestnut-leading-line-insert";
const SKIP_FIRST_CHILD = [
  "prosemirror-virtual-cursor-animation",
  "ProseMirror-gapcursor",
  "ProseMirror-widget",
];

const PLUS_IN_CIRCLE_ICON = `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/>
  <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
</svg>`;

export function leadingEmptyParagraphTransaction(state: EditorState): Transaction | null {
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return null;
  const paragraph = paragraphType.create();
  const tr = state.tr.insert(0, paragraph);
  return tr.setSelection(TextSelection.create(tr.doc, 1));
}

export function insertLeadingEmptyParagraph(view: EditorView): boolean {
  const tr = leadingEmptyParagraphTransaction(view.state);
  if (!tr) return false;
  view.dispatch(tr);
  view.focus();
  return true;
}

export function firstContentBlock(editorEl: HTMLElement): HTMLElement | null {
  for (const child of editorEl.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (SKIP_FIRST_CHILD.some((name) => child.classList.contains(name))) continue;
    if (child.tagName === "BR") continue;
    return child;
  }
  return null;
}

function positionButton(button: HTMLElement, host: HTMLElement, editorEl: HTMLElement): void {
  const block = firstContentBlock(editorEl);
  if (!block) {
    button.hidden = true;
    return;
  }
  const hostRect = host.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  const style = window.getComputedStyle(block);
  const padTop = Number.parseFloat(style.paddingTop) || 0;
  const lineHeight = Number.parseFloat(style.lineHeight);
  const firstLine = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : Math.min(22, blockRect.height);
  const size = button.offsetHeight || 18;
  const top = blockRect.top - hostRect.top + padTop + Math.max(0, (firstLine - size) / 2);
  button.style.top = `${Math.max(0, Math.round(top))}px`;
  button.hidden = false;
}

export function attachLeadingLineInsertButton(
  editorEl: HTMLElement,
  options: { onInsert: () => void },
): () => void {
  const host = editorEl.closest<HTMLElement>(".chestnut-live-editor-inner");
  if (!host) return () => {};

  const t = getT();
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.title = t("note.insertLeadingLine");
  button.setAttribute("aria-label", t("note.insertLeadingLine"));
  button.innerHTML = PLUS_IN_CIRCLE_ICON;
  host.appendChild(button);

  const reposition = () => positionButton(button, host, editorEl);
  const onPointerDown = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const onClick = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onInsert();
    requestAnimationFrame(reposition);
  };

  button.addEventListener("pointerdown", onPointerDown);
  button.addEventListener("click", onClick);

  const observer = new MutationObserver(() => reposition());
  observer.observe(editorEl, { childList: true, subtree: true, attributes: true });
  const resize = new ResizeObserver(() => reposition());
  resize.observe(editorEl);
  resize.observe(host);
  reposition();
  requestAnimationFrame(reposition);

  return () => {
    observer.disconnect();
    resize.disconnect();
    button.removeEventListener("pointerdown", onPointerDown);
    button.removeEventListener("click", onClick);
    button.remove();
  };
}
