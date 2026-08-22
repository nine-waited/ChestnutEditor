import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { findActiveHeadingAtSelection } from "./markdown-heading-level-hint-plugin.js";

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
  },
});

describe("findActiveHeadingAtSelection", () => {
  it("returns heading level when the caret is inside a heading", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 3 }, [schema.text("Title")]),
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(findActiveHeadingAtSelection(state)).toEqual({ innerPos: 1, level: 3 });
  });

  it("returns null when the caret is in a paragraph", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.text("Title")]),
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 9) });
    expect(findActiveHeadingAtSelection(state)).toBeNull();
  });
});
