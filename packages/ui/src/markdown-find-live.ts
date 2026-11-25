import { EditorView as CodeMirrorView } from "@codemirror/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { clearFindHighlights, setFindHighlights } from "./find-highlights.js";
import {
  EMPTY_FIND_STATE,
  MAX_FIND_MATCHES,
  buildFindRegExp,
  expandReplacement,
  findTextMatches,
  matchIndexFrom,
  stepMatchIndex,
  type FindQuery,
  type FindReplaceController,
  type FindState,
} from "./markdown-find-replace.js";

/** Stands in for inline leaves (images, breaks) so string offsets equal PM content offsets. */
const OBJECT_CHAR = "\uFFFC";

interface LiveMatch {
  from: number;
  to: number;
  groups: string[];
  text: string;
  /** Position of the enclosing code block (rendered by CodeMirror), or null for prose. */
  codeBlock: number | null;
}

function textblockText(node: ProseNode): string {
  let text = "";
  node.forEach((child) => {
    text += child.isText ? (child.text ?? "") : OBJECT_CHAR.repeat(child.nodeSize);
  });
  return text;
}

function collectLiveMatches(doc: ProseNode, re: RegExp): LiveMatch[] {
  const matches: LiveMatch[] = [];
  doc.descendants((node, pos) => {
    if (matches.length >= MAX_FIND_MATCHES) return false;
    if (!node.isTextblock) return true;
    const code = Boolean(node.type.spec.code);
    const text = code ? node.textContent : textblockText(node);
    for (const match of findTextMatches(text, re, MAX_FIND_MATCHES - matches.length)) {
      const slice = text.slice(match.from, match.to);
      if (slice.includes(OBJECT_CHAR)) continue;
      matches.push({
        from: pos + 1 + match.from,
        to: pos + 1 + match.to,
        groups: match.groups,
        text: slice,
        codeBlock: code ? pos : null,
      });
    }
    return false;
  });
  return matches;
}

function codeMirrorFor(view: EditorView, blockPos: number): CodeMirrorView | null {
  const dom = view.nodeDOM(blockPos);
  const editor = dom instanceof HTMLElement ? dom.querySelector<HTMLElement>(".cm-editor") : null;
  return editor ? CodeMirrorView.findFromDOM(editor) : null;
}

export class LiveFindController implements FindReplaceController {
  private query: FindQuery | null = null;
  private matches: LiveMatch[] = [];
  private current = -1;
  private invalid = false;
  private doc: ProseNode | null = null;
  private frame: number | null = null;
  private readonly observer: MutationObserver;
  private readonly scrollEl: HTMLElement | null;
  private readonly onScroll = () => this.scheduleHighlights();

  constructor(
    private readonly getView: () => EditorView | null,
    private readonly onExternalChange: (state: FindState) => void,
  ) {
    const view = getView();
    this.scrollEl = view?.dom.closest<HTMLElement>(".chestnut-live-scroll") ?? null;
    this.observer = new MutationObserver(() => this.scheduleHighlights());
    if (view) this.observer.observe(view.dom, { childList: true, subtree: true, characterData: true });
    this.scrollEl?.addEventListener("scroll", this.onScroll, { passive: true });
  }

  search(query: FindQuery): FindState {
    this.query = query;
    const view = this.getView();
    this.collect(view);
    this.current = view ? matchIndexFrom(this.matches, view.state.selection.from) : -1;
    this.reveal();
    return this.state();
  }

  refresh(): FindState {
    this.collect(this.getView());
    this.current = this.matches.length ? Math.min(Math.max(this.current, 0), this.matches.length - 1) : -1;
    this.paint();
    return this.state();
  }

  move(direction: 1 | -1): FindState {
    if (this.getView()?.state.doc !== this.doc) this.refresh();
    this.current = stepMatchIndex(this.matches.length, this.current, direction);
    this.reveal();
    return this.state();
  }

  replaceCurrent(replacement: string): FindState {
    const view = this.getView();
    const match = this.matches[this.current];
    if (!view || !view.editable || !match || !this.query) return this.state();
    const text = expandReplacement(replacement, match.text, match.groups, this.query.regex);
    const tr = text ? view.state.tr.insertText(text, match.from, match.to) : view.state.tr.delete(match.from, match.to);
    view.dispatch(tr);
    this.collect(view);
    this.current = matchIndexFrom(this.matches, match.from + text.length);
    this.reveal();
    return this.state();
  }

  replaceAll(replacement: string): number {
    const view = this.getView();
    if (!view || !view.editable || !this.query || this.matches.length === 0) return 0;
    const { regex } = this.query;
    let tr = view.state.tr;
    for (let i = this.matches.length - 1; i >= 0; i -= 1) {
      const match = this.matches[i]!;
      const text = expandReplacement(replacement, match.text, match.groups, regex);
      tr = text ? tr.insertText(text, match.from, match.to) : tr.delete(match.from, match.to);
    }
    const count = this.matches.length;
    view.dispatch(tr);
    this.collect(view);
    this.current = this.matches.length ? 0 : -1;
    this.paint();
    return count;
  }

  finish(selectCurrent: boolean): void {
    const view = this.getView();
    const match = this.matches[this.current];
    this.dispose();
    if (!view) return;
    if (selectCurrent && match && view.state.doc === this.doc) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)));
    }
    view.focus();
  }

  dispose(): void {
    this.observer.disconnect();
    this.scrollEl?.removeEventListener("scroll", this.onScroll);
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.frame = null;
    clearFindHighlights(this);
  }

  private state(): FindState {
    if (this.invalid) return { ...EMPTY_FIND_STATE, invalid: true };
    return { count: this.matches.length, current: this.current, invalid: false };
  }

  private collect(view: EditorView | null): void {
    const re = this.query ? buildFindRegExp(this.query) : null;
    this.invalid = Boolean(this.query?.text) && !re;
    this.doc = view?.state.doc ?? null;
    this.matches = view && re ? collectLiveMatches(view.state.doc, re) : [];
  }

  private scheduleHighlights(): void {
    if (this.frame != null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const view = this.getView();
      if (view && view.state.doc !== this.doc) {
        this.onExternalChange(this.refresh());
        return;
      }
      this.paint();
    });
  }

  private rangeFor(view: EditorView, match: LiveMatch): Range | null {
    try {
      let start: { node: Node; offset: number };
      let end: { node: Node; offset: number };
      if (match.codeBlock != null) {
        const cm = codeMirrorFor(view, match.codeBlock);
        if (!cm) return null;
        const base = match.codeBlock + 1;
        const from = match.from - base;
        const to = match.to - base;
        if (from < cm.viewport.from || to > cm.viewport.to) return null;
        start = cm.domAtPos(from);
        end = cm.domAtPos(to);
      } else {
        start = view.domAtPos(match.from);
        end = view.domAtPos(match.to);
      }
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      return range;
    } catch {
      return null;
    }
  }

  private paint(): void {
    const view = this.getView();
    if (!view || this.matches.length === 0) {
      clearFindHighlights(this);
      return;
    }
    const all: Range[] = [];
    let current: Range | null = null;
    this.matches.forEach((match, index) => {
      const range = this.rangeFor(view, match);
      if (!range) return;
      all.push(range);
      if (index === this.current) current = range;
    });
    setFindHighlights(this, all, current);
  }

  private matchTop(view: EditorView, match: LiveMatch): { top: number; bottom: number } | null {
    try {
      if (match.codeBlock != null) {
        const cm = codeMirrorFor(view, match.codeBlock);
        if (!cm) return null;
        const block = cm.lineBlockAt(match.from - match.codeBlock - 1);
        return { top: cm.documentTop + block.top, bottom: cm.documentTop + block.bottom };
      }
      const coords = view.coordsAtPos(match.from);
      return { top: coords.top, bottom: coords.bottom };
    } catch {
      return null;
    }
  }

  private reveal(): void {
    const view = this.getView();
    const match = this.matches[this.current];
    if (view && match && this.scrollEl) {
      const rect = this.matchTop(view, match);
      const box = this.scrollEl.getBoundingClientRect();
      const margin = 48;
      if (rect && (rect.top < box.top + margin || rect.bottom > box.bottom - margin)) {
        this.scrollEl.scrollTop += rect.top - box.top - box.height / 3;
      }
    }
    this.paint();
  }
}
