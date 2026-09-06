import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { leadingEmptyParagraphTransaction } from "./markdown-leading-line-insert.js";

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

describe("leadingEmptyParagraphTransaction", () => {
  it("inserts an empty paragraph before the first block and places the caret in it", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.text("Title")]),
      schema.node("paragraph", null, [schema.text("Body")]),
    ]);
    const state = EditorState.create({ schema, doc });
    const tr = leadingEmptyParagraphTransaction(state);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.childCount).toBe(3);
    expect(next.doc.child(0).type.name).toBe("paragraph");
    expect(next.doc.child(0).content.size).toBe(0);
    expect(next.doc.child(1).textContent).toBe("Title");
    expect(next.selection.from).toBe(1);
  });
});
