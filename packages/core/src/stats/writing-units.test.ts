import { describe, expect, it } from "vitest";
import { countWritingUnits, localDateKey } from "./writing-units.js";

describe("countWritingUnits", () => {
  it("counts CJK characters individually", () => {
    expect(countWritingUnits("今天写")).toBe(3);
  });

  it("counts Latin words not letters", () => {
    expect(countWritingUnits("hello world")).toBe(2);
  });

  it("mixes CJK and English", () => {
    expect(countWritingUnits("今天写 hello world")).toBe(5);
  });

  it("ignores punctuation and markdown markers", () => {
    expect(countWritingUnits("# 标题\n\n- hello\n")).toBe(3);
  });

  it("counts fenced code identifiers as words, not ticks", () => {
    expect(countWritingUnits("```js\nfoo\n```")).toBe(2);
  });

  it("returns 0 for empty or punctuation-only source", () => {
    expect(countWritingUnits("")).toBe(0);
    expect(countWritingUnits("*** ---")).toBe(0);
  });
});

describe("localDateKey", () => {
  it("formats YYYY-MM-DD in local time", () => {
    expect(localDateKey(new Date(2026, 7, 26, 23, 30))).toBe("2026-08-26");
  });
});
