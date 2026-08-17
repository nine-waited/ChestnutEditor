import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { Mapping } from "@milkdown/kit/prose/transform";
import {
  headingMarksToPlainDelimiters,
  wasPromotedToHeading,
} from "./markdown-heading-plain-plugin.js";

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
  marks: {
    strong: {},
    emphasis: {},
    inlineCode: {},
    strike_through: {},
  },
});

describe("headingMarksToPlainDelimiters", () => {
  it("converts strong to **…** plain text", () => {
    const heading = schema.node("heading", { level: 1 }, [
      schema.text("sla", [schema.marks.strong.create()]),
    ]);
    expect(headingMarksToPlainDelimiters(heading)).toBe("**sla**");
  });

  it("converts inlineCode to `…` plain text", () => {
    const heading = schema.node("heading", { level: 1 }, [
      schema.text("code", [schema.marks.inlineCode.create()]),
    ]);
    expect(headingMarksToPlainDelimiters(heading)).toBe("`code`");
  });
});

describe("wasPromotedToHeading", () => {
  it("is true when old doc had a paragraph at that spot", () => {
    const oldDoc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("hi", [schema.marks.strong.create()])]),
    ]);
    const newDoc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.text("hi", [schema.marks.strong.create()])]),
    ]);
    const oldState = EditorState.create({ schema, doc: oldDoc });
    const tr = oldState.tr.replaceWith(0, oldState.doc.content.size, newDoc.content);
    const forward = new Mapping([tr.mapping]);
    expect(wasPromotedToHeading(oldState, forward, 0)).toBe(true);
  });

  it("is false when old doc already had a heading", () => {
    const oldDoc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.text("hi")]),
    ]);
    const newDoc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [
        schema.text("hi", [schema.marks.strong.create()]),
      ]),
    ]);
    const oldState = EditorState.create({ schema, doc: oldDoc });
    const tr = oldState.tr.replaceWith(0, oldState.doc.content.size, newDoc.content);
    const forward = new Mapping([tr.mapping]);
    // Full replace may not preserve pos mapping; also verify setBlockType-style map.
    // When old heading start maps to new heading start, not a promote.
    const mapped = forward.map(0, -1);
    if (mapped === 0) {
      expect(wasPromotedToHeading(oldState, forward, 0)).toBe(false);
    } else {
      // Identity doc change with marks only: map old heading → same pos
      const markTr = oldState.tr.addMark(1, 1 + 2, schema.marks.strong.create());
      const markForward = new Mapping([markTr.mapping]);
      expect(wasPromotedToHeading(oldState, markForward, 0)).toBe(false);
    }
  });
});
