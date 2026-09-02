import { describe, expect, it } from "vitest";
import { shouldCollapseFormatToolbarOnFocusOut } from "./markdown-editor-format-toolbar.js";

const editor = { contains: (node: Node) => node === editorChild } as unknown as Element;
const editorChild = {} as Node;
const outside = {} as Node;
const toolbarChild = {} as Node;
const toolbar = { contains: (node: Node) => node === toolbarChild } as unknown as Element;

describe("shouldCollapseFormatToolbarOnFocusOut", () => {
  it("collapses when focus leaves the editor", () => {
    expect(
      shouldCollapseFormatToolbarOnFocusOut({
        relatedTarget: outside,
        editorEl: editor,
        toolbar,
      }),
    ).toBe(true);
  });

  it("collapses when relatedTarget is null (click on non-focusable blank)", () => {
    expect(
      shouldCollapseFormatToolbarOnFocusOut({
        relatedTarget: null,
        editorEl: editor,
        toolbar,
      }),
    ).toBe(true);
  });

  it("keeps the toolbar when focus moves into it", () => {
    expect(
      shouldCollapseFormatToolbarOnFocusOut({
        relatedTarget: toolbarChild,
        editorEl: editor,
        toolbar,
      }),
    ).toBe(false);
  });

  it("keeps the toolbar when focus stays in the editor", () => {
    expect(
      shouldCollapseFormatToolbarOnFocusOut({
        relatedTarget: editorChild,
        editorEl: editor,
        toolbar,
      }),
    ).toBe(false);
  });
});
