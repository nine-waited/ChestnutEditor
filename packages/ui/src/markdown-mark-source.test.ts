import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Schema, type Mark, type Node } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { history, undo } from "@milkdown/kit/prose/history";
import { DecorationSet } from "@milkdown/kit/prose/view";
import { remarkHighlight } from "./markdown-highlight.js";
import { createInlineSourceCodec, createMarkSourcePlugin, isEditingMarkSource } from "./markdown-mark-source.js";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    code_block: { content: "text*", group: "block", code: true },
    math_inline: { group: "inline", inline: true, atom: true, attrs: { value: { default: "" } } },
  },
  marks: {
    strong: { attrs: { marker: { default: "*" } } },
    emphasis: { attrs: { marker: { default: "*" } } },
    strike_through: {},
    highlight: {},
    inlineCode: { excludes: "_" },
  },
});

interface Md {
  type: string;
  value?: string;
  children?: Md[];
}

function processor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkHighlight as never)
    .use(remarkStringify, { handlers: { text: (node: { value: string }) => node.value } } as never);
}

const MARK_FOR: Record<string, string> = { strong: "strong", emphasis: "emphasis", delete: "strike_through", highlight: "highlight" };
const MD_FOR: Record<string, string> = { strong: "strong", emphasis: "emphasis", strike_through: "delete", highlight: "highlight" };
const ORDER = ["strike_through", "strong", "emphasis", "highlight"];

function inlineToPm(nodes: Md[], marks: readonly Mark[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (node.type === "text") out.push(schema.text(node.value ?? "", marks));
    else if (node.type === "inlineCode") out.push(schema.text(node.value ?? "", [...marks, schema.marks.inlineCode.create()]));
    else if (node.type === "inlineMath") out.push(schema.nodes.math_inline.create({ value: node.value ?? "" }));
    else if (MARK_FOR[node.type]) out.push(...inlineToPm(node.children ?? [], schema.marks[MARK_FOR[node.type]!]!.create().addToSet(marks)));
  }
  return out;
}

function parseDoc(markdown: string): Node {
  const p = processor();
  const tree = p.runSync(p.parse(markdown)) as unknown as Md;
  const blocks = (tree.children ?? []).map((block) =>
    block.type === "paragraph"
      ? schema.nodes.paragraph.create(null, inlineToPm(block.children ?? [], []))
      : schema.nodes.code_block.create(null, schema.text(block.type)),
  );
  return schema.nodes.doc.create(null, blocks.length ? blocks : [schema.nodes.paragraph.create()]);
}

type Leaf = { node: Md; marks: string[] };

function leavesToMd(leaves: Leaf[]): Md[] {
  const out: Md[] = [];
  let i = 0;
  while (i < leaves.length) {
    const outer = ORDER.find((name) => leaves[i]!.marks.includes(name));
    if (!outer) {
      out.push(leaves[i]!.node);
      i += 1;
      continue;
    }
    let j = i;
    while (j < leaves.length && leaves[j]!.marks.includes(outer)) j += 1;
    const inner = leaves.slice(i, j).map((leaf) => ({ node: leaf.node, marks: leaf.marks.filter((name) => name !== outer) }));
    out.push({ type: MD_FOR[outer]!, children: leavesToMd(inner) });
    i = j;
  }
  return out;
}

function serializeDoc(doc: Node): string {
  const blocks: Md[] = [];
  doc.forEach((block) => {
    const leaves: Leaf[] = [];
    block.forEach((child) => {
      if (child.type.name === "math_inline") {
        leaves.push({ node: { type: "inlineMath", value: String(child.attrs.value) }, marks: [] });
        return;
      }
      const names = child.marks.map((mark) => mark.type.name);
      const node: Md = names.includes("inlineCode") ? { type: "inlineCode", value: child.text } : { type: "text", value: child.text };
      leaves.push({ node, marks: names.filter((name) => name !== "inlineCode") });
    });
    blocks.push({ type: "paragraph", children: leavesToMd(leaves) });
  });
  return processor().stringify({ type: "root", children: blocks } as never);
}

const codec = createInlineSourceCodec({ schema: () => schema, parseDoc, serializeDoc });

function create(markdown: string, caret = 1, withHistory = false): EditorState {
  const doc = parseDoc(markdown);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, caret),
    plugins: withHistory ? [history(), createMarkSourcePlugin(codec)] : [createMarkSourcePlugin(codec)],
  });
}

function moveTo(state: EditorState, pos: number, head = pos): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos, head)));
}

function text(state: EditorState): string {
  return state.doc.textContent;
}

function decorationClasses(state: EditorState): Array<{ text: string; cls: string }> {
  const plugin = state.plugins.find((item) => item.spec.codec);
  const set = plugin?.getState(state)?.decorations as DecorationSet;
  return set.find().map((deco) => ({
    text: state.doc.textBetween(deco.from, deco.to),
    cls: (deco as unknown as { type: { attrs: { class: string } } }).type.attrs.class,
  }));
}

describe("mark source reveal", () => {
  it("reveals **bold** as real text when the caret enters", () => {
    // "x bold y": bold occupies 3..7
    const state = moveTo(create("x **bold** y"), 5);
    expect(text(state)).toBe("x **bold** y");
    expect(state.doc.rangeHasMark(1, state.doc.content.size, schema.marks.strong)).toBe(false);
    expect(state.selection.from).toBe(7);
    expect(isEditingMarkSource(state)).toBe(true);
  });

  it("restores bold when the caret leaves", () => {
    const revealed = moveTo(create("x **bold** y"), 5);
    const left = moveTo(revealed, 1);
    expect(text(left)).toBe("x bold y");
    expect(left.doc.rangeHasMark(3, 7, schema.marks.strong)).toBe(true);
    expect(isEditingMarkSource(left)).toBe(false);
  });

  it("serializes the same Markdown while revealed", () => {
    const original = create("x **bold** y");
    const revealed = moveTo(original, 5);
    expect(serializeDoc(revealed.doc)).toBe(serializeDoc(original.doc));
  });

  it("keeps typed text after the closing stars plain", () => {
    let state = moveTo(create("x **bold** y"), 5);
    const end = 3 + "**bold**".length;
    state = moveTo(state, end);
    state = state.apply(state.tr.insertText("z", end));
    expect(text(state)).toBe("x **bold**z y");
    expect(decorationClasses(state)).toContainEqual({ text: "bold", cls: "chestnut-expanded-strong" });
    expect(decorationClasses(state).some((deco) => deco.text.includes("z"))).toBe(false);
    state = moveTo(state, 1);
    expect(text(state)).toBe("x boldz y");
    expect(state.doc.rangeHasMark(3, 7, schema.marks.strong)).toBe(true);
    expect(state.doc.rangeHasMark(7, 8, schema.marks.strong)).toBe(false);
  });

  it("re-parses edited delimiters like source mode", () => {
    let state = moveTo(create("x **bold** y"), 5);
    // delete the first and last star: *bold*
    state = state.apply(state.tr.delete(10, 11).delete(3, 4));
    expect(text(state)).toBe("x *bold* y");
    state = moveTo(state, 1);
    expect(text(state)).toBe("x bold y");
    expect(state.doc.rangeHasMark(3, 7, schema.marks.emphasis)).toBe(true);
    expect(state.doc.rangeHasMark(3, 7, schema.marks.strong)).toBe(false);
  });

  it("turns fully removed delimiters into plain text", () => {
    let state = moveTo(create("x **bold** y"), 5);
    state = state.apply(state.tr.delete(9, 11).delete(3, 5));
    state = moveTo(state, 1);
    expect(text(state)).toBe("x bold y");
    expect(state.doc.rangeHasMark(1, state.doc.content.size, schema.marks.strong)).toBe(false);
  });

  it("handles highlight, strike, inline code and stacked marks", () => {
    for (const source of ["==hi==", "~~hi~~", "`hi`", "***hi***"]) {
      const state = moveTo(create(`a ${source} b`), 4);
      expect(text(state)).toBe(`a ${source} b`);
      expect(text(moveTo(state, 1))).toBe("a hi b");
    }
  });

  it("reveals inline math as $…$ and restores the formula", () => {
    const original = create("a $x^2$ b");
    const revealed = moveTo(original, 3);
    expect(text(revealed)).toBe("a $x^2$ b");
    const restored = moveTo(revealed, 1);
    expect(restored.doc.firstChild!.child(1).type.name).toBe("math_inline");
  });

  it("places the caret outside the delimiters when arriving by keyboard at an edge", () => {
    const fromLeft = moveTo(create("x **bold** y"), 3);
    expect(fromLeft.selection.from).toBe(3);
    const fromRight = moveTo(create("x **bold** y"), 7);
    expect(fromRight.selection.from).toBe(3 + "**bold**".length);
  });

  it("keeps the source revealed while a selection stays inside it", () => {
    let state = moveTo(create("x **bold** y"), 5);
    state = moveTo(state, 4, 9);
    expect(text(state)).toBe("x **bold** y");
    state = moveTo(state, 4, 13);
    expect(text(state)).toBe("x bold y");
  });

  it("does not reveal plain text", () => {
    const state = moveTo(create("plain text"), 3);
    expect(text(state)).toBe("plain text");
    expect(isEditingMarkSource(state)).toBe(false);
  });

  it("undoes an edit made while revealed", () => {
    let state = moveTo(create("x **bold** y", 1, true), 5);
    state = state.apply(state.tr.insertText("Q", 7));
    state = moveTo(state, 1);
    expect(text(state)).toBe("x boQld y");
    undo(state, (tr) => {
      state = state.apply(tr);
    });
    expect(serializeDoc(state.doc)).toBe(serializeDoc(create("x **bold** y").doc));
  });
});
