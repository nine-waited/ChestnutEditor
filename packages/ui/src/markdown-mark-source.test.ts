import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { collapseFormattedText, expandFormattedText, findFormattedSpan } from "./markdown-mark-source.js";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    math_inline: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { value: { default: "" } },
    },
  },
  marks: {
    strong: {
      attrs: { marker: { default: "*" } },
    },
    emphasis: {
      attrs: { marker: { default: "*" } },
    },
    strike_through: {},
  },
});

function stateWith(doc: ReturnType<Schema["node"]>, pos: number): EditorState {
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, pos) });
}

describe("formatted source text", () => {
  it("turns focused bold into real ** text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("bold", [schema.marks.strong.create()])]),
    ]);
    const state = stateWith(doc, 3);
    expect(findFormattedSpan(doc, 3)).toEqual({ from: 1, to: 5 });
    const next = state.apply(expandFormattedText(state, { from: 1, to: 5 }, 3, null)!);
    expect(next.doc.textContent).toBe("**bold**");
    expect(next.doc.rangeHasMark(1, 9, schema.marks.strong)).toBe(false);
    expect(next.selection.from).toBe(5);
  });

  it("restores the bold mark when the real delimiters are unchanged", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("**bold**")]),
    ]);
    const state = stateWith(doc, 1);
    const next = state.apply(collapseFormattedText(state, { from: 1, to: 9 })!);
    expect(next.doc.textContent).toBe("bold");
    expect(next.doc.rangeHasMark(1, 5, schema.marks.strong)).toBe(true);
  });

  it("turns stacked bold and italic into real *** text and back", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("x", [schema.marks.strong.create(), schema.marks.emphasis.create()]),
      ]),
    ]);
    const state = stateWith(doc, 1);
    const expanded = state.apply(expandFormattedText(state, { from: 1, to: 2 }, 1, null)!);
    expect(expanded.doc.textContent).toBe("***x***");
    const collapsed = expanded.apply(collapseFormattedText(expanded, { from: 1, to: 8 })!);
    expect(collapsed.doc.textContent).toBe("x");
    expect(collapsed.doc.rangeHasMark(1, 2, schema.marks.strong)).toBe(true);
    expect(collapsed.doc.rangeHasMark(1, 2, schema.marks.emphasis)).toBe(true);
  });

  it("turns inline math into real $ text", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.node("math_inline", { value: "x^2" })]),
    ]);
    const state = stateWith(doc, 1);
    const next = state.apply(expandFormattedText(state, { from: 1, to: 2 }, 1, null)!);
    expect(next.doc.textContent).toBe("$x^2$");
  });
});
