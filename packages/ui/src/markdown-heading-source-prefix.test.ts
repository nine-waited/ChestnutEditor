import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  applyHeadingCollapse,
  applyHeadingExpand,
  createHeadingSourcePrefixPlugin,
  headingHasSourcePrefix,
  headingLevelFromSourcePrefix,
  headingSourcePrefix,
  stripMirroredHeadingTitle,
} from "./markdown-heading-source-prefix.js";

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

function headingThenBody(level: number, title: string) {
  return schema.node("doc", null, [
    schema.node("heading", { level }, title ? [schema.text(title)] : []),
    schema.node("paragraph", null, [schema.text("Body")]),
  ]);
}

function applySelection(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

describe("heading source prefix helpers", () => {
  it("builds an ATX prefix with a trailing space", () => {
    expect(headingSourcePrefix(2)).toBe("## ");
    expect(headingSourcePrefix(0)).toBe("");
  });

  it("expands once and collapses back to the title", () => {
    expect(applyHeadingExpand("Hi", 2)).toEqual({ text: "## Hi", prefixLength: 3 });
    expect(applyHeadingExpand("## Hi", 2)).toEqual({ text: "## Hi", prefixLength: 3 });
    expect(applyHeadingCollapse("## Hi")).toBe("Hi");
    expect(applyHeadingCollapse("Hi")).toBe("Hi");
  });

  it("reads the heading level from the visible hashes", () => {
    expect(headingHasSourcePrefix("## Hi")).toBe(true);
    expect(headingHasSourcePrefix("Hi")).toBe(false);
    expect(headingHasSourcePrefix("#foo")).toBe(false);
    expect(headingLevelFromSourcePrefix("### x")).toBe(3);
    expect(headingLevelFromSourcePrefix("Hi")).toBe(0);
  });

  it("strips a mirrored serialize prefix", () => {
    expect(stripMirroredHeadingTitle("##", "## Title")).toBe("Title");
    expect(stripMirroredHeadingTitle("#", "# Hello")).toBe("Hello");
    expect(stripMirroredHeadingTitle("##", "Title")).toBe("Title");
    expect(stripMirroredHeadingTitle("##", "##foo")).toBe("##foo");
  });
});

describe("headingSourcePrefixPlugin", () => {
  it("inserts hashes when the caret enters a heading", () => {
    const doc = headingThenBody(2, "Hi");
    let state = EditorState.create({
      schema,
      doc,
      plugins: [createHeadingSourcePrefixPlugin()],
      selection: TextSelection.create(doc, 6),
    });
    expect(state.doc.firstChild?.textContent).toBe("Hi");
    state = applySelection(state, 2);
    expect(state.doc.firstChild?.type.name).toBe("heading");
    expect(state.doc.firstChild?.textContent).toBe("## Hi");
    expect(state.doc.firstChild?.attrs.level).toBe(2);
  });

  it("removes hashes when the caret leaves the heading", () => {
    const doc = headingThenBody(2, "Hi");
    let state = EditorState.create({
      schema,
      doc,
      plugins: [createHeadingSourcePrefixPlugin()],
      selection: TextSelection.create(doc, 2),
    });
    state = applySelection(state, 2);
    expect(state.doc.firstChild?.textContent).toBe("## Hi");
    const body = state.doc.content.size - 2;
    state = applySelection(state, body);
    expect(state.doc.firstChild?.textContent).toBe("Hi");
  });

  it("demotes the heading when a hash is deleted instead of restoring it", () => {
    const doc = headingThenBody(2, "## Hi");
    let state = EditorState.create({
      schema,
      doc,
      plugins: [createHeadingSourcePrefixPlugin()],
      selection: TextSelection.create(doc, 3),
    });
    expect(state.doc.firstChild?.textContent).toBe("## Hi");
    state = state.apply(state.tr.delete(2, 3));
    expect(state.doc.firstChild?.type.name).toBe("heading");
    expect(state.doc.firstChild?.textContent).toBe("# Hi");
    expect(state.doc.firstChild?.attrs.level).toBe(1);
  });

  it("converts to a paragraph after the last hash is removed", () => {
    const doc = headingThenBody(1, "# Hi");
    let state = EditorState.create({
      schema,
      doc,
      plugins: [createHeadingSourcePrefixPlugin()],
      selection: TextSelection.create(doc, 2),
    });
    state = state.apply(state.tr.delete(1, 2));
    expect(state.doc.firstChild?.type.name).toBe("paragraph");
    expect(state.doc.firstChild?.textContent).toBe("Hi");
  });
});
