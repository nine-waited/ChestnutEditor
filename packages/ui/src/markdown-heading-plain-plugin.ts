import { $prose } from "@milkdown/utils";
import type { Node } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Mapping } from "@milkdown/kit/prose/transform";
import { stripInlineMarkdownFormat } from "./markdown-strip-inline.js";

function isInlineCodeMark(name: string): boolean {
  return name === "inlineCode" || name === "code_inline" || name === "code";
}

/**
 * Turn heading inline marks into literal markdown delimiters as plain text
 * (e.g. strong → `**…**`, code → `` `…` ``), so they can be escaped in source
 * instead of being discarded. Used only when the block was already a heading.
 */
export function headingMarksToPlainDelimiters(node: Node): string {
  let out = "";
  node.forEach((child) => {
    if (!child.isText) {
      out += child.textContent;
      return;
    }
    let text = child.text ?? "";
    const names = new Set(child.marks.map((m) => m.type.name));
    if ([...names].some(isInlineCodeMark)) text = `\`${text}\``;
    if (names.has("strong")) text = `**${text}**`;
    else if (names.has("emphasis")) text = `*${text}*`;
    if (names.has("strike_through") || names.has("strikethrough")) text = `~~${text}~~`;
    out += text;
  });
  return out;
}

function composeForwardMapping(transactions: readonly Transaction[]): Mapping {
  const mapping = new Mapping();
  for (const tr of transactions) mapping.appendMapping(tr.mapping);
  return mapping;
}

/**
 * True when this heading did not come from an existing heading
 * (body → heading promote, including `# ` input rule / setBlockType).
 */
export function wasPromotedToHeading(
  oldState: EditorState,
  forwardMapping: Mapping,
  newHeadingPos: number,
): boolean {
  let cameFromHeading = false;
  oldState.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const mapped = forwardMapping.map(pos, -1);
    if (mapped === newHeadingPos) cameFromHeading = true;
  });
  return !cameFromHeading;
}

function headingHasMarks(node: Node): boolean {
  let hasMarks = false;
  node.forEach((child) => {
    if (child.marks.length > 0) hasMarks = true;
  });
  return hasMarks;
}

/**
 * Live headings:
 * - Promote (body → heading): strip bold/italic/code/highlight text to plain.
 * - Already a heading + new marks: convert marks to literal `**` / `` ` `` delimiters.
 */
export const headingPlainTextPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey("chestnut-heading-plain-text"),
      appendTransaction(transactions, oldState, newState) {
        if (!transactions.some((tr) => tr.docChanged)) return null;

        const schema = newState.schema;
        const forward = composeForwardMapping(transactions);
        const targets: Array<{ innerFrom: number; innerTo: number; text: string }> = [];

        newState.doc.descendants((node, pos) => {
          if (node.type.name !== "heading") return;

          const promoted = wasPromotedToHeading(oldState, forward, pos);
          const hasMarks = headingHasMarks(node);
          const raw = node.textContent;
          let next: string | null = null;

          if (promoted) {
            // Body formats (marks or leftover `**` / `==` wraps) must clear on promote.
            const stripped = stripInlineMarkdownFormat(raw);
            if (hasMarks || stripped !== raw) next = stripped;
          } else if (hasMarks) {
            next = headingMarksToPlainDelimiters(node);
          }

          if (next === null) return;

          targets.push({
            innerFrom: pos + 1,
            innerTo: pos + node.nodeSize - 1,
            text: next,
          });
        });

        if (!targets.length) return null;

        let tr = newState.tr;
        for (const heading of targets.sort((a, b) => b.innerFrom - a.innerFrom)) {
          tr = tr.replaceWith(
            heading.innerFrom,
            heading.innerTo,
            heading.text ? schema.text(heading.text) : [],
          );
        }
        return tr;
      },
    }),
);
