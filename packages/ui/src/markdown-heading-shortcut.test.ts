import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { applyHeadingSourcePrefixState } from "./markdown-heading-source-prefix.js";
import {
  applyHeadingShortcutToLine,
  applyLiveHeadingShortcut,
  atxHeadingLevel,
} from "./markdown-heading-shortcut.js";

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

function headingDoc(level: number, title: string) {
  return schema.node("doc", null, [
    schema.node("heading", { level }, title ? [schema.text(title)] : []),
    schema.node("paragraph", null, [schema.text("Body")]),
  ]);
}

function paragraphDoc(text: string) {
  return schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
}

function stateAt(doc: ReturnType<typeof headingDoc>, pos: number): EditorState {
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, pos),
  });
}

describe("atxHeadingLevel", () => {
  it("reads the hash count", () => {
    expect(atxHeadingLevel("# Hi")).toBe(1);
    expect(atxHeadingLevel("### Hi")).toBe(3);
    expect(atxHeadingLevel("Hi")).toBe(0);
  });
});

describe("applyHeadingShortcutToLine", () => {
  it("promotes body text", () => {
    expect(applyHeadingShortcutToLine("Hello", 2, false)).toBe("## Hello");
  });

  it("changes heading level without stripping the title", () => {
    expect(applyHeadingShortcutToLine("# Hi", 3, false)).toBe("### Hi");
  });

  it("demotes the same heading back to body", () => {
    expect(applyHeadingShortcutToLine("## Hi", 2, true)).toBe("Hi");
  });
});

describe("applyLiveHeadingShortcut", () => {
  it("promotes a paragraph to a heading", () => {
    const state = stateAt(paragraphDoc("Hello"), 1);
    const tr = applyLiveHeadingShortcut(state, 1);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.firstChild?.type.name).toBe("heading");
    expect(next.doc.firstChild?.attrs.level).toBe(1);
  });

  it("rewrites visible hashes when changing heading level", () => {
    const state = stateAt(headingDoc(1, "# Hi"), 2);
    const tr = applyLiveHeadingShortcut(state, 2);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.firstChild?.type.name).toBe("heading");
    expect(next.doc.firstChild?.attrs.level).toBe(2);
    expect(next.doc.firstChild?.textContent).toBe("## Hi");

    const sync = applyHeadingSourcePrefixState(next, undefined, true, 1);
    expect(sync).toBeNull();
    expect(next.doc.firstChild?.attrs.level).toBe(2);
  });

  it("toggles the same heading back to a paragraph", () => {
    const state = stateAt(headingDoc(2, "## Hi"), 3);
    const tr = applyLiveHeadingShortcut(state, 2);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!);
    expect(next.doc.firstChild?.type.name).toBe("paragraph");
    expect(next.doc.firstChild?.textContent).toBe("Hi");
  });
});
