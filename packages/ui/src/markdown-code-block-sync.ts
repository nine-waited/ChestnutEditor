import { EditorView as CodeMirrorView } from "@codemirror/view";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";

export function isCodeBlockNodeName(name: string): boolean {
  const n = name.toLowerCase().replace(/-/g, "_");
  return n === "code_block" || n === "codeblock";
}

export function isCodeBlockNode(node: Node): boolean {
  return isCodeBlockNodeName(node.type.name);
}

export function normalizeCodeText(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** True when the inner CodeMirror / placeholder does not match ProseMirror text. */
export function codeBlockViewOutOfSync(displayed: string, expected: string): boolean {
  return normalizeCodeText(displayed) !== normalizeCodeText(expected);
}

/**
 * Visible (or CodeMirror-state) text of a Crepe code-block node view.
 * Empty host after replaceAll/updateState is the live/source desync we remount for.
 */
export function readCodeBlockDisplayedText(dom: HTMLElement): string {
  const cmHost = dom.querySelector(".cm-editor");
  if (cmHost instanceof HTMLElement) {
    const cm = CodeMirrorView.findFromDOM(cmHost);
    if (cm) return cm.state.doc.toString();
    const content = cmHost.querySelector(".cm-content");
    if (content) return content.textContent ?? "";
  }
  const placeholder = dom.querySelector(".milkdown-code-block-placeholder");
  if (placeholder) return placeholder.textContent ?? "";
  return "";
}

function remountCodeBlockAt(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node || !isCodeBlockNode(node)) return;

  const size = node.nodeSize;
  const fresh = node.type.create(node.attrs, node.content, node.marks);
  view.dispatch(view.state.tr.delete(pos, pos + size).setMeta("addToHistory", false));
  view.dispatch(view.state.tr.insert(pos, fresh).setMeta("addToHistory", false));
}

function refreshNestedCodeMirror(dom: HTMLElement): void {
  const cmHost = dom.querySelector(".cm-editor");
  if (!(cmHost instanceof HTMLElement)) return;
  CodeMirrorView.findFromDOM(cmHost)?.requestMeasure();
}

/**
 * After Live `replaceAll(flush)` / keep-alive show / view-only, Crepe's nested
 * CodeMirror can stay empty while the ProseMirror node (and Source) still have text:
 * `update()` always returns true, and read-only `changeFilter` drops CM transactions.
 * Delete+insert forces a fresh node view (same trick as image-block captions).
 */
export function syncCodeBlockNodeViews(view: EditorView): number {
  const mismatched: number[] = [];

  view.state.doc.descendants((node, pos) => {
    if (!isCodeBlockNode(node)) return;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) {
      if (node.textContent) mismatched.push(pos);
      return;
    }
    if (codeBlockViewOutOfSync(readCodeBlockDisplayedText(dom), node.textContent)) {
      mismatched.push(pos);
      return;
    }
    refreshNestedCodeMirror(dom);
  });

  for (const pos of mismatched.sort((a, b) => b - a)) {
    remountCodeBlockAt(view, pos);
  }
  return mismatched.length;
}
