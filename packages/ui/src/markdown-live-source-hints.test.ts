import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  collectLiveSourceHintSpecs,
  collectMarkHintRanges,
  collectMathHintRanges,
  findHeadingAtPos,
} from "./markdown-live-source-hints.js";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    heading: {
      content: "inline*",
      group: "block",
      defining: true,
      attrs: { level: { default: 1 } },
    },
    paragraph: { content: "inline*", group: "block" },
    code_block: { content: "text*", group: "block", code: true, defining: true },
    math_inline: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { value: { default: "" } },
    },
  },
  marks: {
    strong: {},
    emphasis: {},
    inlineCode: {},
    strike_through: {},
  },
});

describe("findHeadingAtPos", () => {
  it("returns heading level at a heading caret", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 3 }, [schema.text("Title")]),
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    expect(findHeadingAtPos(doc, 3)).toEqual({ innerPos: 1, level: 3 });
  });

  it("returns null in a paragraph", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.text("Title")]),
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    expect(findHeadingAtPos(doc, 9)).toBeNull();
  });
});

describe("collectMarkHintRanges", () => {
  it("finds strong bounds around the caret", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("hi "),
        schema.text("bold", [schema.marks.strong.create()]),
        schema.text(" x"),
      ]),
    ]);
    const ranges = collectMarkHintRanges(doc, 5);
    expect(ranges).toEqual([{ from: 4, to: 8, token: "**", order: 2, markName: "strong" }]);
  });

  it("stacks nested strong+emphasis as overlapping ranges", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("both", [schema.marks.strong.create(), schema.marks.emphasis.create()]),
      ]),
    ]);
    const ranges = collectMarkHintRanges(doc, 2);
    expect(ranges).toEqual(
      expect.arrayContaining([
        { from: 1, to: 5, token: "**", order: 2, markName: "strong" },
        { from: 1, to: 5, token: "*", order: 3, markName: "emphasis" },
      ]),
    );
  });

  it("skips marks inside a heading", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [
        schema.text("Title", [schema.marks.strong.create()]),
      ]),
    ]);
    expect(collectMarkHintRanges(doc, 2)).toEqual([]);
  });
});

describe("collectLiveSourceHintSpecs", () => {
  it("shows heading hashes for caret or hover", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 2 }, [schema.text("Hi")]),
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const caretInBody = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 8),
    });
    const specs = collectLiveSourceHintSpecs(caretInBody, 2);
    expect(specs).toContainEqual({ pos: 1, side: -1, text: "## ", kind: "heading", pieces: [] });
  });

  it("skips heading widgets once the hashes are in the document", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 2 }, [schema.text("## Hi")]),
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    const specs = collectLiveSourceHintSpecs(state, null);
    expect(specs.some((spec) => spec.kind === "heading")).toBe(false);
  });

  it("emits ** widgets at strong bounds", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("bold", [schema.marks.strong.create()])]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    const specs = collectLiveSourceHintSpecs(state, null);
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pos: 1, side: -1, text: "**", kind: "mark" }),
        expect.objectContaining({ pos: 5, side: 1, text: "**", kind: "mark" }),
      ]),
    );
    expect(specs.find((spec) => spec.side === -1)?.pieces).toEqual([
      { token: "**", markName: "strong", from: 1, to: 5 },
    ]);
  });

  it("combines nested delimiters at the same boundary", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("x", [schema.marks.strong.create(), schema.marks.emphasis.create()]),
      ]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
    const specs = collectLiveSourceHintSpecs(state, null);
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pos: 1, side: -1, text: "***", kind: "mark" }),
        expect.objectContaining({ pos: 2, side: 1, text: "***", kind: "mark" }),
      ]),
    );
  });

  it("shows == around highlight ranges", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi")]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    const specs = collectLiveSourceHintSpecs(state, null, [{ from: 1, to: 3 }]);
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pos: 1, side: -1, text: "==", kind: "mark" }),
        expect.objectContaining({ pos: 3, side: 1, text: "==", kind: "mark" }),
      ]),
    );
  });

  it("shows backticks for inline code", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("code", [schema.marks.inlineCode.create()])]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    const specs = collectLiveSourceHintSpecs(state, null);
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pos: 1, side: -1, text: "`", kind: "mark" }),
        expect.objectContaining({ pos: 5, side: 1, text: "`", kind: "mark" }),
      ]),
    );
  });

  it("shows $ around inline math", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("a"),
        schema.node("math_inline", { value: "x^2" }),
        schema.text("b"),
      ]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) });
    expect(collectMathHintRanges(doc, 2)).toEqual([
      { from: 2, to: 3, token: "$", order: -1, markName: "math" },
    ]);
    const specs = collectLiveSourceHintSpecs(state, null);
    expect(specs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pos: 2, side: -1, text: "$", kind: "mark" }),
        expect.objectContaining({ pos: 3, side: 1, text: "$", kind: "mark" }),
      ]),
    );
    expect(specs.find((spec) => spec.side === -1)?.pieces).toEqual([
      { token: "$", markName: "math", from: 2, to: 3 },
    ]);
  });
});
