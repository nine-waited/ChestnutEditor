import { $prose } from "@milkdown/utils";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";

export const HEADING_SOURCE_PREFIX_META = "chestnut-heading-source-prefix";

const pluginKey = new PluginKey<HeadingPrefixPluginState>("chestnut-heading-source-prefix");

interface HeadingPrefixPluginState {
  expandedInnerPos: number | null;
  /** Heading just created by typing `# `; keep its prefix hidden until the caret is moved. */
  hiddenInnerPos: number | null;
  decorations: DecorationSet;
}

export interface HeadingSourceSplit {
  hashes: string;
  space: string;
  title: string;
}

export interface HeadingPrefixEnterMeta {
  enterOffset?: number;
}

export function headingSourcePrefix(level: number): string {
  const n = Math.min(6, Math.max(0, level));
  return n > 0 ? `${"#".repeat(n)} ` : "";
}

/** True when heading text already has an ATX prefix (`#`…`######` then space or end). */
export function headingHasSourcePrefix(text: string): boolean {
  return /^#{1,6}(?:\s|$)/.test(text);
}

export function splitHeadingSource(text: string): HeadingSourceSplit | null {
  const match = /^(#{1,6})(\s*)([\s\S]*)$/.exec(text);
  if (!match) return null;
  return { hashes: match[1], space: match[2], title: match[3] };
}

export function headingPrefixLength(text: string): number {
  if (!headingHasSourcePrefix(text)) return 0;
  const split = splitHeadingSource(text);
  return split ? split.hashes.length + split.space.length : 0;
}

export function applyHeadingExpand(
  text: string,
  level: number,
): { text: string; prefixLength: number } {
  if (headingHasSourcePrefix(text)) {
    return { text, prefixLength: headingPrefixLength(text) };
  }
  const prefix = headingSourcePrefix(level);
  return { text: prefix + text, prefixLength: prefix.length };
}

export function applyHeadingCollapse(text: string): string {
  if (!headingHasSourcePrefix(text)) return text;
  return splitHeadingSource(text)?.title ?? text;
}

export function headingLevelFromSourcePrefix(text: string): number {
  if (!headingHasSourcePrefix(text)) return 0;
  return splitHeadingSource(text)?.hashes.length ?? 0;
}

/** Drop a copied ATX prefix from the heading title so serialize does not write `## ## Title`. */
export function stripMirroredHeadingTitle(atxHashes: string, title: string): string {
  if (!atxHashes || !title.startsWith(atxHashes)) return title;
  const rest = title.slice(atxHashes.length);
  if (rest.startsWith(" ") || rest.startsWith("\t")) return rest.slice(1);
  if (rest === "") return rest;
  return title;
}

function findHeadingAtPos(doc: Node, pos: number): { pos: number; innerPos: number; node: Node } | null {
  const safe = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(safe);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (node.type.name !== "heading") continue;
    return { pos: $pos.before(depth), innerPos: $pos.start(depth), node };
  }
  return null;
}

function buildPrefixDecorations(doc: Node): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const text = node.textContent;
    const length = headingPrefixLength(text);
    if (length <= 0) return;
    const from = pos + 1;
    decorations.push(
      Decoration.inline(from, from + length, {
        class: "chestnut-heading-source-prefix",
      }),
    );
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

type PrefixJob =
  | { kind: "insert"; pos: number; innerFrom: number; prefix: string }
  | { kind: "delete"; pos: number; innerFrom: number; length: number }
  | { kind: "level"; pos: number; level: number; attrs: Node["attrs"] }
  | { kind: "paragraph"; pos: number; innerFrom: number; stripLeadingSpace: boolean };

export function applyHeadingSourcePrefixState(
  newState: EditorState,
  enterOffset: number | undefined,
  editable: boolean,
  wasExpandedInnerPos: number | null,
  hiddenInnerPos: number | null = null,
): Transaction | null {
  if (!editable) return null;
  if (!newState.selection.empty) return null;

  const paragraph = newState.schema.nodes.paragraph;
  const caretHeading = findHeadingAtPos(newState.doc, newState.selection.from);
  const jobs: PrefixJob[] = [];

  newState.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const innerFrom = pos + 1;
    const inCaret = caretHeading?.innerPos === innerFrom && hiddenInnerPos !== innerFrom;
    const text = node.textContent;

    if (inCaret) {
      if (!headingHasSourcePrefix(text)) {
        if (wasExpandedInnerPos === innerFrom) {
          jobs.push({
            kind: "paragraph",
            pos,
            innerFrom,
            stripLeadingSpace: text.startsWith(" "),
          });
        } else {
          const prefix = headingSourcePrefix(Number(node.attrs.level) || 1);
          if (prefix) jobs.push({ kind: "insert", pos, innerFrom, prefix });
        }
        return;
      }
      const level = headingLevelFromSourcePrefix(text);
      if (level <= 0) {
        jobs.push({
          kind: "paragraph",
          pos,
          innerFrom,
          stripLeadingSpace: text.startsWith(" "),
        });
        return;
      }
      if (level !== Number(node.attrs.level)) {
        jobs.push({ kind: "level", pos, level, attrs: node.attrs });
      }
      return;
    }

    const length = headingPrefixLength(text);
    if (length > 0) jobs.push({ kind: "delete", pos, innerFrom, length });
  });

  if (!jobs.length) return null;

  let tr = newState.tr;
  let changed = false;
  for (const job of [...jobs].sort((a, b) => b.pos - a.pos)) {
    const innerFrom = tr.mapping.map(job.kind === "level" ? job.pos + 1 : job.innerFrom);
    if (job.kind === "insert") {
      tr = tr.insertText(job.prefix, innerFrom);
      const prefixLength = job.prefix.length;
      const at =
        enterOffset != null
          ? innerFrom + Math.max(0, Math.min(enterOffset, prefixLength))
          : tr.mapping.map(newState.selection.from, 1);
      tr = tr.setSelection(TextSelection.create(tr.doc, at));
      changed = true;
      continue;
    }
    if (job.kind === "delete") {
      tr = tr.delete(innerFrom, innerFrom + job.length);
      changed = true;
      continue;
    }
    if (job.kind === "level") {
      const mappedPos = tr.mapping.map(job.pos);
      tr = tr.setNodeMarkup(mappedPos, undefined, { ...job.attrs, level: job.level });
      changed = true;
      continue;
    }
    if (!paragraph) continue;
    if (job.stripLeadingSpace) {
      const $inner = tr.doc.resolve(innerFrom);
      if ($inner.parent.textContent.startsWith(" ")) tr = tr.delete(innerFrom, innerFrom + 1);
    }
    const mappedPos = tr.mapping.map(job.pos);
    const mappedNode = tr.doc.nodeAt(mappedPos);
    if (!mappedNode) continue;
    tr = tr.setBlockType(mappedPos, mappedPos + mappedNode.nodeSize, paragraph);
    tr = tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(innerFrom)));
    changed = true;
  }

  if (!changed) return null;
  return tr.setMeta(HEADING_SOURCE_PREFIX_META, { sync: true }).setMeta("addToHistory", false);
}

/** Remove the revealed prefix so undo/redo replays against the document history recorded. */
export function collapseHeadingSourcePrefixTransaction(state: EditorState): Transaction | null {
  const expanded = pluginKey.getState(state)?.expandedInnerPos;
  if (expanded == null) return null;
  const heading = findHeadingAtPos(state.doc, state.selection.from);
  if (!heading || heading.innerPos !== expanded) return null;
  const length = headingPrefixLength(heading.node.textContent);
  if (length <= 0) return null;
  return state.tr
    .delete(heading.innerPos, heading.innerPos + length)
    .setMeta(HEADING_SOURCE_PREFIX_META, { sync: true })
    .setMeta("addToHistory", false);
}

function collapseBeforeHistory(view: EditorView): void {
  const tr = collapseHeadingSourcePrefixTransaction(view.state);
  if (tr) view.dispatch(tr);
}

export function createHeadingSourcePrefixPlugin(): Plugin {
  let editorView: EditorView | null = null;

  return new Plugin({
    key: pluginKey,
    view(view) {
      editorView = view;
      return {
        destroy() {
          editorView = null;
        },
      };
    },
    state: {
      init(_, state) {
        const heading = findHeadingAtPos(state.doc, state.selection.from);
        return {
          expandedInnerPos:
            heading && headingHasSourcePrefix(heading.node.textContent) ? heading.innerPos : null,
          hiddenInnerPos: null,
          decorations: buildPrefixDecorations(state.doc),
        };
      },
      apply(tr, value, oldState, newState): HeadingPrefixPluginState {
        let expanded = value.expandedInnerPos;
        if (expanded != null && tr.docChanged) expanded = tr.mapping.map(expanded);
        const heading = findHeadingAtPos(newState.doc, newState.selection.from);
        let hidden = value.hiddenInnerPos;
        if (hidden != null && tr.docChanged) hidden = tr.mapping.map(hidden);
        const enterMeta = tr.getMeta(HEADING_SOURCE_PREFIX_META) as HeadingPrefixEnterMeta | undefined;
        if (!heading || heading.innerPos !== hidden || (tr.selectionSet && !tr.docChanged)) hidden = null;
        if (
          heading &&
          tr.docChanged &&
          enterMeta?.enterOffset == null &&
          !headingHasSourcePrefix(heading.node.textContent) &&
          !findHeadingAtPos(oldState.doc, oldState.selection.from)
        ) {
          hidden = heading.innerPos;
        }
        if (hidden != null) {
          expanded = null;
        } else if (heading && headingHasSourcePrefix(heading.node.textContent)) {
          expanded = heading.innerPos;
        } else if (!heading) {
          expanded = null;
        }
        return {
          expandedInnerPos: expanded,
          hiddenInnerPos: hidden,
          decorations: tr.docChanged ? buildPrefixDecorations(newState.doc) : value.decorations,
        };
      },
    },
    props: {
      decorations(state) {
        return this.getState(state)?.decorations ?? DecorationSet.empty;
      },
      handleDOMEvents: {
        keydown(view, event) {
          if ((event.ctrlKey || event.metaKey) && !event.altKey && /^[zy]$/i.test(event.key)) {
            collapseBeforeHistory(view);
          }
          return false;
        },
        beforeinput(view, event) {
          const type = (event as InputEvent).inputType;
          if (type === "historyUndo" || type === "historyRedo") collapseBeforeHistory(view);
          return false;
        },
      },
    },
    appendTransaction(transactions, _oldState, newState) {
      if (transactions.some((tr) => tr.getMeta(HEADING_SOURCE_PREFIX_META)?.sync)) return null;
      if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;
      if (editorView?.composing) return null;
      const meta = transactions
        .map((tr) => tr.getMeta(HEADING_SOURCE_PREFIX_META) as HeadingPrefixEnterMeta | undefined)
        .find((value) => value && value.enterOffset != null);
      const pluginState = pluginKey.getState(newState);
      return applyHeadingSourcePrefixState(
        newState,
        meta?.enterOffset,
        editorView?.editable !== false,
        pluginState?.expandedInnerPos ?? null,
        pluginState?.hiddenInnerPos ?? null,
      );
    },
  });
}

export const headingSourcePrefixPlugin = $prose(() => createHeadingSourcePrefixPlugin());
