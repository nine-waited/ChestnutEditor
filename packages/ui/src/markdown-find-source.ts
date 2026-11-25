import { StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import {
  EMPTY_FIND_STATE,
  buildFindRegExp,
  expandReplacement,
  findTextMatches,
  matchIndexFrom,
  stepMatchIndex,
  type FindQuery,
  type FindReplaceController,
  type FindState,
  type TextMatch,
} from "./markdown-find-replace.js";

const matchMark = Decoration.mark({ class: "cm-chestnut-find-match" });
const currentMark = Decoration.mark({ class: "cm-chestnut-find-match cm-chestnut-find-current" });

const setFindMatches = StateEffect.define<{ matches: TextMatch[]; current: number } | null>();

const findMatchesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setFindMatches)) continue;
      if (!effect.value) return Decoration.none;
      const { matches, current } = effect.value;
      return Decoration.set(
        matches.map((match, index) => (index === current ? currentMark : matchMark).range(match.from, match.to)),
      );
    }
    return tr.docChanged ? decorations.map(tr.changes) : decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const docChangeListeners = new WeakMap<EditorView, () => void>();

export const sourceFindExtension: Extension = [
  findMatchesField,
  EditorView.updateListener.of((update) => {
    if (update.docChanged) docChangeListeners.get(update.view)?.();
  }),
];

export class SourceFindController implements FindReplaceController {
  private query: FindQuery | null = null;
  private matches: TextMatch[] = [];
  private current = -1;
  private invalid = false;
  private doc: Text | null = null;
  private frame: number | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly onExternalChange: (state: FindState) => void,
  ) {
    docChangeListeners.set(view, () => this.scheduleRefresh());
  }

  search(query: FindQuery): FindState {
    this.query = query;
    this.collect();
    this.current = matchIndexFrom(this.matches, this.view.state.selection.main.from);
    this.reveal();
    return this.state();
  }

  refresh(): FindState {
    this.collect();
    this.current = this.matches.length ? Math.min(Math.max(this.current, 0), this.matches.length - 1) : -1;
    this.paint();
    return this.state();
  }

  move(direction: 1 | -1): FindState {
    if (this.view.state.doc !== this.doc) this.refresh();
    this.current = stepMatchIndex(this.matches.length, this.current, direction);
    this.reveal();
    return this.state();
  }

  replaceCurrent(replacement: string): FindState {
    const match = this.matches[this.current];
    if (!match || !this.query || this.view.state.readOnly) return this.state();
    const text = this.expand(replacement, match);
    this.view.dispatch({ changes: { from: match.from, to: match.to, insert: text }, userEvent: "input.replace" });
    this.collect();
    this.current = matchIndexFrom(this.matches, match.from + text.length);
    this.reveal();
    return this.state();
  }

  replaceAll(replacement: string): number {
    if (!this.query || this.view.state.readOnly || this.matches.length === 0) return 0;
    const count = this.matches.length;
    this.view.dispatch({
      changes: this.matches.map((match) => ({ from: match.from, to: match.to, insert: this.expand(replacement, match) })),
      userEvent: "input.replace.all",
    });
    this.collect();
    this.current = this.matches.length ? 0 : -1;
    this.paint();
    return count;
  }

  finish(selectCurrent: boolean): void {
    const match = this.matches[this.current];
    const fresh = this.view.state.doc === this.doc;
    this.dispose();
    if (selectCurrent && match && fresh) {
      this.view.dispatch({
        selection: { anchor: match.from, head: match.to },
        effects: EditorView.scrollIntoView(match.from, { y: "nearest", yMargin: 80 }),
      });
    }
    this.view.focus();
  }

  dispose(): void {
    docChangeListeners.delete(this.view);
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.view.dom.isConnected) this.view.dispatch({ effects: setFindMatches.of(null) });
  }

  private expand(replacement: string, match: TextMatch): string {
    const original = this.view.state.doc.sliceString(match.from, match.to);
    return expandReplacement(replacement, original, match.groups, Boolean(this.query?.regex));
  }

  private state(): FindState {
    if (this.invalid) return { ...EMPTY_FIND_STATE, invalid: true };
    return { count: this.matches.length, current: this.current, invalid: false };
  }

  private collect(): void {
    const re = this.query ? buildFindRegExp(this.query) : null;
    this.invalid = Boolean(this.query?.text) && !re;
    this.doc = this.view.state.doc;
    this.matches = re ? findTextMatches(this.doc.toString(), re) : [];
  }

  private scheduleRefresh(): void {
    if (this.frame != null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      if (this.view.state.doc === this.doc) return;
      this.onExternalChange(this.refresh());
    });
  }

  private paint(): void {
    this.view.dispatch({ effects: setFindMatches.of({ matches: this.matches, current: this.current }) });
  }

  private reveal(): void {
    const match = this.matches[this.current];
    this.view.dispatch({
      effects: [
        setFindMatches.of({ matches: this.matches, current: this.current }),
        ...(match ? [EditorView.scrollIntoView(match.from, { y: "nearest", yMargin: 80 })] : []),
      ],
    });
  }
}
