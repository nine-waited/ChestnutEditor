import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { markRule } from "@milkdown/kit/prose";
import { toggleMark } from "@milkdown/kit/prose/commands";
import { $command, $inputRule, $markSchema, $remark } from "@milkdown/kit/utils";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

const MARKER = /(?<!=)==(?!=)/g;

type Piece = { marker: true } | { marker: false; node: MdNode };

function splitText(node: MdNode): Piece[] {
  const value = node.value ?? "";
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of value.matchAll(MARKER)) {
    const at = match.index ?? 0;
    if (at > last) pieces.push({ marker: false, node: { type: "text", value: value.slice(last, at) } });
    pieces.push({ marker: true });
    last = at + 2;
  }
  if (last < value.length) pieces.push({ marker: false, node: { type: "text", value: value.slice(last) } });
  return pieces;
}

function validContent(nodes: MdNode[]): boolean {
  if (nodes.length === 0) return false;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  if (first.type === "text" && /^\s/.test(first.value ?? "")) return false;
  if (last.type === "text" && /\s$/.test(last.value ?? "")) return false;
  return true;
}

function pushMerged(out: MdNode[], node: MdNode): void {
  const prev = out[out.length - 1];
  if (prev && prev.type === "text" && node.type === "text") {
    out[out.length - 1] = { type: "text", value: (prev.value ?? "") + (node.value ?? "") };
    return;
  }
  out.push(node);
}

function highlightChildren(children: MdNode[]): MdNode[] {
  const pieces: Piece[] = [];
  for (const child of children) {
    if (child.children) child.children = highlightChildren(child.children);
    if (child.type === "text" && child.value?.includes("==")) pieces.push(...splitText(child));
    else pieces.push({ marker: false, node: child });
  }
  if (!pieces.some((piece) => piece.marker)) return children;

  const out: MdNode[] = [];
  let open: MdNode[] | null = null;
  for (const piece of pieces) {
    if (!piece.marker) {
      if (open) open.push(piece.node);
      else pushMerged(out, piece.node);
      continue;
    }
    if (!open) {
      open = [];
      continue;
    }
    if (validContent(open)) {
      out.push({ type: "highlight", children: open });
      open = null;
      continue;
    }
    pushMerged(out, { type: "text", value: "==" });
    for (const node of open) pushMerged(out, node);
    open = [];
  }
  if (open) {
    pushMerged(out, { type: "text", value: "==" });
    for (const node of open) pushMerged(out, node);
  }
  return out;
}

/** Turn `==text==` into mdast `highlight` nodes so live mode gets a real mark. */
export function transformHighlight(tree: MdNode): void {
  if (tree.children) tree.children = highlightChildren(tree.children);
}

interface StringifyState {
  enter(name: string): () => void;
  containerPhrasing(node: MdNode, info: Record<string, unknown>): string;
}

function stringifyHighlight(node: MdNode, _parent: unknown, state: StringifyState, info: Record<string, unknown>): string {
  const exit = state.enter("highlight");
  const value = state.containerPhrasing(node, { ...info, before: "=", after: "=" });
  exit();
  return `==${value}==`;
}

export function remarkHighlight(this: { data(): Record<string, unknown[] | undefined> }) {
  const data = this.data();
  const extensions = (data.toMarkdownExtensions ??= []);
  extensions.push({ handlers: { highlight: stringifyHighlight } });
  return (tree: MdNode) => transformHighlight(tree);
}

export const remarkHighlightPlugin = $remark("remarkChestnutHighlight", () => remarkHighlight as never);

export const highlightSchema = $markSchema("highlight", () => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: () => ["mark", { class: "chestnut-highlight" }, 0],
  parseMarkdown: {
    match: (node) => node.type === "highlight",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "highlight",
    runner: (state, mark) => {
      state.withMark(mark, "highlight");
    },
  },
}));

export const toggleHighlightCommand = $command("ToggleChestnutHighlight", (ctx) => () => toggleMark(highlightSchema.type(ctx)));

export const highlightInputRule = $inputRule((ctx) =>
  markRule(/(?<![\w=])==([^=\s](?:[^=]*[^=\s])?)==$/, highlightSchema.type(ctx)),
);

export const highlightPlugins: MilkdownPlugin[] = [
  remarkHighlightPlugin,
  highlightSchema,
  toggleHighlightCommand,
  highlightInputRule,
].flat();
