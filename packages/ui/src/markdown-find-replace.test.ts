import { describe, expect, it } from "vitest";
import {
  buildFindRegExp,
  expandReplacement,
  findTextMatches,
  isFindQueryInvalid,
  matchIndexFrom,
  stepMatchIndex,
  type FindQuery,
} from "./markdown-find-replace.js";

function query(text: string, opts: Partial<FindQuery> = {}): FindQuery {
  return { text, caseSensitive: false, wholeWord: false, regex: false, ...opts };
}

function ranges(text: string, q: FindQuery) {
  const re = buildFindRegExp(q);
  return re ? findTextMatches(text, re).map(({ from, to }) => [from, to]) : null;
}

describe("buildFindRegExp / findTextMatches", () => {
  it("matches literal text case-insensitively by default", () => {
    expect(ranges("Foo foo FOO", query("foo"))).toEqual([
      [0, 3],
      [4, 7],
      [8, 11],
    ]);
  });

  it("escapes regex characters in plain mode", () => {
    expect(ranges("a.b axb a.b", query("a.b"))).toEqual([
      [0, 3],
      [8, 11],
    ]);
  });

  it("respects case sensitivity", () => {
    expect(ranges("Foo foo", query("foo", { caseSensitive: true }))).toEqual([[4, 7]]);
  });

  it("supports whole word including CJK neighbours", () => {
    expect(ranges("cat concat cat_x cat", query("cat", { wholeWord: true }))).toEqual([
      [0, 3],
      [17, 20],
    ]);
    expect(ranges("中cat文 cat", query("cat", { wholeWord: true }))).toEqual([[6, 9]]);
  });

  it("supports regex and skips empty matches", () => {
    expect(ranges("a1 b22 c", query("\\d+", { regex: true }))).toEqual([
      [1, 2],
      [4, 6],
    ]);
    expect(ranges("abc", query("x*", { regex: true }))).toEqual([]);
  });

  it("reports invalid regex and empty queries", () => {
    expect(buildFindRegExp(query(""))).toBeNull();
    expect(isFindQueryInvalid(query(""))).toBe(false);
    expect(isFindQueryInvalid(query("(", { regex: true }))).toBe(true);
    expect(isFindQueryInvalid(query("(", { regex: false }))).toBe(false);
  });
});

describe("expandReplacement", () => {
  it("inserts plain replacements literally", () => {
    expect(expandReplacement("$1 $&", "ab", ["a"], false)).toBe("$1 $&");
  });

  it("expands regex groups", () => {
    expect(expandReplacement("$2-$1 [$&] $$", "a:b", ["a", "b"], true)).toBe("b-a [a:b] $");
    expect(expandReplacement("$10", "x", ["g1"], true)).toBe("g10");
    expect(expandReplacement("$3", "x", ["g1"], true)).toBe("$3");
  });
});

describe("match navigation", () => {
  const matches = [{ from: 2 }, { from: 10 }, { from: 20 }];

  it("starts from the first match after the caret and wraps", () => {
    expect(matchIndexFrom(matches, 0)).toBe(0);
    expect(matchIndexFrom(matches, 11)).toBe(2);
    expect(matchIndexFrom(matches, 30)).toBe(0);
    expect(matchIndexFrom([], 0)).toBe(-1);
  });

  it("steps forward and backward cyclically", () => {
    expect(stepMatchIndex(3, 2, 1)).toBe(0);
    expect(stepMatchIndex(3, 0, -1)).toBe(2);
    expect(stepMatchIndex(3, -1, -1)).toBe(2);
    expect(stepMatchIndex(0, -1, 1)).toBe(-1);
  });
});
