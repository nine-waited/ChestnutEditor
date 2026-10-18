import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { remarkHighlight } from "./markdown-highlight.js";

function processor() {
  return unified().use(remarkParse).use(remarkHighlight as never).use(remarkStringify);
}

function parse(markdown: string): unknown {
  const p = processor();
  return p.runSync(p.parse(markdown));
}

function roundTrip(markdown: string): string {
  const p = processor();
  return p.stringify(p.runSync(p.parse(markdown)) as never).trimEnd();
}

function paragraphChildren(markdown: string): Array<{ type: string; value?: string; children?: unknown[] }> {
  const tree = parse(markdown) as { children: Array<{ children: Array<{ type: string; value?: string }> }> };
  return tree.children[0]!.children;
}

describe("remarkHighlight", () => {
  it("parses ==text== as a highlight node", () => {
    const children = paragraphChildren("a ==hi== b");
    expect(children.map((child) => child.type)).toEqual(["text", "highlight", "text"]);
    expect(children[1]!.children).toEqual([{ type: "text", value: "hi" }]);
  });

  it("wraps other inline nodes between the markers", () => {
    const children = paragraphChildren("==**bold**==");
    expect(children).toHaveLength(1);
    expect(children[0]!.type).toBe("highlight");
    expect((children[0]!.children as Array<{ type: string }>)[0]!.type).toBe("strong");
  });

  it("leaves === and space-padded markers as text", () => {
    expect(paragraphChildren("a === b === c").map((child) => child.type)).toEqual(["text"]);
    expect(paragraphChildren("== x ==").map((child) => child.type)).toEqual(["text"]);
  });

  it("writes highlight back as ==text==", () => {
    expect(roundTrip("a ==hi== b")).toBe("a ==hi== b");
    expect(roundTrip("==**bold**==")).toBe("==**bold**==");
  });
});
