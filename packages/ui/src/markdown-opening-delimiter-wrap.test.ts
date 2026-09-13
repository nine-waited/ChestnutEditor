import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  applyOpeningDelimiterWrap,
  matchOpeningDelimiterWrap,
} from "./markdown-opening-delimiter-wrap.js";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
  },
  marks: {
    inlineCode: {
      parseDOM: [{ tag: "code" }],
      toDOM: () => ["code", 0],
    },
    emphasis: {
      attrs: { marker: { default: "*" } },
      parseDOM: [{ tag: "em" }],
      toDOM: () => ["em", 0],
    },
    strong: {
      attrs: { marker: { default: "*" } },
      parseDOM: [{ tag: "strong" }],
      toDOM: () => ["strong", 0],
    },
    strike_through: {
      parseDOM: [{ tag: "del" }],
      toDOM: () => ["del", 0],
    },
  },
});

function docWith(text: string) {
  return schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
}

function stateAt(text: string, pos: number): EditorState {
  const doc = docWith(text);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, pos),
  });
}

describe("matchOpeningDelimiterWrap", () => {
  it("matches a closing backtick already after the caret", () => {
    expect(matchOpeningDelimiterWrap("`", "", "s`")).toEqual({
      token: "`",
      markName: "inlineCode",
      innerLength: 1,
      prefixLength: 0,
    });
  });

  it("does not match a lone opening backtick", () => {
    expect(matchOpeningDelimiterWrap("`", "", "s")).toBeNull();
  });

  it("matches italic when the closer is a single star", () => {
    expect(matchOpeningDelimiterWrap("*", "", "s*")).toEqual({
      token: "*",
      markName: "emphasis",
      innerLength: 1,
      prefixLength: 0,
    });
  });

  it("does not treat ** as italic while the opener is still a single star", () => {
    expect(matchOpeningDelimiterWrap("*", "", "s**")).toBeNull();
  });

  it("matches bold when the second opening star is typed", () => {
    expect(matchOpeningDelimiterWrap("*", "*", "s**")).toEqual({
      token: "**",
      markName: "strong",
      innerLength: 1,
      prefixLength: 1,
    });
  });

  it("matches strikethrough when the second opening tilde is typed", () => {
    expect(matchOpeningDelimiterWrap("~", "~", "s~~")).toEqual({
      token: "~~",
      markName: "strike_through",
      innerLength: 1,
      prefixLength: 1,
    });
  });

  it("matches underscore italic and bold the same way as stars", () => {
    expect(matchOpeningDelimiterWrap("_", "", "s_")).toEqual({
      token: "_",
      markName: "emphasis",
      innerLength: 1,
      prefixLength: 0,
    });
    expect(matchOpeningDelimiterWrap("_", "_", "s__")).toEqual({
      token: "__",
      markName: "strong",
      innerLength: 1,
      prefixLength: 1,
    });
  });
});

describe("applyOpeningDelimiterWrap", () => {
  it("wraps s` into inline code when ` is typed before s", () => {
    const state = stateAt("s`", 1);
    const tr = applyOpeningDelimiterWrap(state, 1, 1, "`");
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.textContent).toBe("s");
    expect(next.doc.rangeHasMark(1, 2, schema.marks.inlineCode)).toBe(true);
  });

  it("wraps s* into italic when * is typed before s", () => {
    const state = stateAt("s*", 1);
    const next = state.apply(applyOpeningDelimiterWrap(state, 1, 1, "*")!);
    expect(next.doc.textContent).toBe("s");
    expect(next.doc.rangeHasMark(1, 2, schema.marks.emphasis)).toBe(true);
  });

  it("wraps *s** into bold when the second opening star is typed", () => {
    const state = stateAt("*s**", 2);
    const next = state.apply(applyOpeningDelimiterWrap(state, 2, 2, "*")!);
    expect(next.doc.textContent).toBe("s");
    expect(next.doc.rangeHasMark(1, 2, schema.marks.strong)).toBe(true);
  });

  it("wraps ~s~~ into strike when the second opening tilde is typed", () => {
    const state = stateAt("~s~~", 2);
    const next = state.apply(applyOpeningDelimiterWrap(state, 2, 2, "~")!);
    expect(next.doc.textContent).toBe("s");
    expect(next.doc.rangeHasMark(1, 2, schema.marks.strike_through)).toBe(true);
  });
});
