import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import {
  applyHeadingCollapse,
  applyHeadingExpand,
  headingSourcePrefix,
} from "./markdown-heading-source-prefix.js";
import { sanitizeHeadingTitleOnPromote } from "./markdown-heading-sanitize.js";

/** ATX heading level of a source line, or 0 for body text. */
export function atxHeadingLevel(line: string): number {
  const match = /^(#{1,6})\s+/.exec(line);
  return match ? match[1].length : 0;
}

/**
 * Apply Ctrl+N heading shortcut to a source line.
 * Same level again → body; otherwise set the requested heading.
 */
export function applyHeadingShortcutToLine(line: string, level: number, demote: boolean): string {
  const title = line.replace(/^#{1,6}\s+/, "");
  if (demote) return title;
  if (atxHeadingLevel(line) === 0) {
    return `${headingSourcePrefix(level)}${sanitizeHeadingTitleOnPromote(title)}`;
  }
  return `${headingSourcePrefix(level)}${title}`;
}

function collectBlocks(state: EditorState): Array<{ pos: number; node: Node }> {
  const { from, to, $from } = state.selection;
  const blocks: Array<{ pos: number; node: Node }> = [];
  const seen = new Set<number>();

  const add = (pos: number, node: Node) => {
    if (node.type.name !== "heading" && node.type.name !== "paragraph") return;
    if (seen.has(pos)) return;
    seen.add(pos);
    blocks.push({ pos, node });
  };

  if (from === to) {
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "heading" || node.type.name === "paragraph") {
        add($from.before(depth), node);
        break;
      }
    }
    return blocks;
  }

  state.doc.nodesBetween(from, to, (node, pos) => {
    add(pos, node);
  });
  return blocks;
}

function replaceBlockText(tr: Transaction, pos: number, node: Node, text: string): Transaction {
  const innerFrom = pos + 1;
  const innerTo = pos + node.nodeSize - 1;
  const schema = tr.doc.type.schema;
  return tr.replaceWith(innerFrom, innerTo, text ? schema.text(text) : []);
}

/**
 * Live-editor Ctrl+1…6: toggle the same heading back to a paragraph,
 * and rewrite visible `#` hashes when changing level so the prefix plugin
 * does not snap the block back.
 */
export function applyLiveHeadingShortcut(state: EditorState, level: number): Transaction | null {
  const paragraph = state.schema.nodes.paragraph;
  const headingType = state.schema.nodes.heading;
  if (!paragraph || !headingType) return null;

  const blocks = collectBlocks(state);
  if (!blocks.length) return null;

  const demote = blocks.every(
    (block) => block.node.type.name === "heading" && Number(block.node.attrs.level) === level,
  );

  let tr = state.tr;
  for (const block of [...blocks].sort((a, b) => b.pos - a.pos)) {
    const node = tr.doc.nodeAt(block.pos);
    if (!node) continue;

    if (demote) {
      tr = replaceBlockText(tr, block.pos, node, applyHeadingCollapse(node.textContent));
      const next = tr.doc.nodeAt(block.pos);
      if (next) tr = tr.setBlockType(block.pos, block.pos + next.nodeSize, paragraph);
      continue;
    }

    if (node.type.name === "heading") {
      const nextText = applyHeadingExpand(applyHeadingCollapse(node.textContent), level).text;
      tr = replaceBlockText(tr, block.pos, node, nextText);
      const next = tr.doc.nodeAt(block.pos);
      if (next) tr = tr.setNodeMarkup(block.pos, undefined, { ...next.attrs, level });
      continue;
    }

    tr = tr.setBlockType(block.pos, block.pos + node.nodeSize, headingType, { level });
  }

  return tr.docChanged ? tr : null;
}
