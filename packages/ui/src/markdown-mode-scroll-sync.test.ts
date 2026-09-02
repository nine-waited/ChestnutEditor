import { describe, expect, it } from "vitest";
import {
  countPriorMatchingBlocks,
  docLineFromBlock,
  elementScrollRatio,
  pickFirstIntersectingIndex,
  scrollTopFromRatio,
} from "./markdown-mode-scroll-sync.js";

describe("markdown mode scroll sync", () => {
  it("maps scroll ratio through the usable range", () => {
    expect(elementScrollRatio({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 })).toBe(0);
    expect(elementScrollRatio({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 })).toBe(0.5);
    expect(elementScrollRatio({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(1);
    expect(scrollTopFromRatio(0.5, 1000, 200)).toBe(400);
    expect(scrollTopFromRatio(2, 1000, 200)).toBe(800);
    expect(scrollTopFromRatio(0.5, 100, 200)).toBe(0);
  });

  it("picks the first block that intersects the viewport top", () => {
    const rects = [
      { top: 0, bottom: 40 },
      { top: 40, bottom: 120 },
      { top: 120, bottom: 200 },
    ];
    expect(pickFirstIntersectingIndex(rects, 0)).toBe(0);
    expect(pickFirstIntersectingIndex(rects, 40)).toBe(1);
    expect(pickFirstIntersectingIndex(rects, 130)).toBe(2);
    expect(pickFirstIntersectingIndex(rects, 400)).toBe(-1);
  });

  it("maps a heading and a later duplicate body line back to markdown", () => {
    const markdown = ["# Title", "", "hello", "", "hello", "", "## Next"].join("\n");
    expect(docLineFromBlock(markdown, "Title", 0, true)).toBe(0);
    expect(docLineFromBlock(markdown, "hello", 0, false)).toBe(2);
    expect(docLineFromBlock(markdown, "hello", 1, false)).toBe(4);
    expect(docLineFromBlock(markdown, "Next", 0, true)).toBe(6);
    expect(docLineFromBlock(markdown, "missing", 0, false)).toBeNull();
  });

  it("counts prior matching blocks of the same kind", () => {
    const blocks = [
      { text: "Title", isHeading: true },
      { text: "hello", isHeading: false },
      { text: "hello", isHeading: false },
    ];
    expect(countPriorMatchingBlocks(blocks, 1)).toBe(0);
    expect(countPriorMatchingBlocks(blocks, 2)).toBe(1);
  });
});
