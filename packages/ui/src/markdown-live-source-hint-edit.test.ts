import { describe, expect, it } from "vitest";
import {
  diffMarkPieces,
  editTokenText,
  parseDelimTokens,
  parseHeadingHashText,
  piecesAfterDiff,
} from "./markdown-live-source-hint-edit.js";

describe("parseDelimTokens", () => {
  it("parses nested *** as strong then emphasis", () => {
    expect(parseDelimTokens("***")).toEqual(["**", "*"]);
  });

  it("parses mixed delimiters", () => {
    expect(parseDelimTokens("~~**")).toEqual(["~~", "**"]);
  });

  it("parses math dollar delimiters", () => {
    expect(parseDelimTokens("$")).toEqual(["$"]);
    expect(parseDelimTokens("")).toEqual([]);
  });
});

describe("editTokenText", () => {
  it("backspaces a heading hash", () => {
    expect(editTokenText("###", 3, { type: "backspace" })).toEqual({ text: "##", offset: 2 });
  });

  it("inserts a delimiter character", () => {
    expect(editTokenText("**", 2, { type: "insert", char: "*" })).toEqual({ text: "***", offset: 3 });
  });
});

describe("parseHeadingHashText", () => {
  it("counts up to 6 hashes and treats the rest as extra", () => {
    expect(parseHeadingHashText("###")).toEqual({ level: 3, extra: "" });
    expect(parseHeadingHashText("")).toEqual({ level: 0, extra: "" });
    expect(parseHeadingHashText("##Hello")).toEqual({ level: 2, extra: "Hello" });
    expect(parseHeadingHashText("#######")).toEqual({ level: 6, extra: "" });
  });
});

describe("diffMarkPieces", () => {
  const strong = { token: "**", markName: "strong" as const, from: 1, to: 5 };
  const em = { token: "*", markName: "emphasis" as const, from: 1, to: 5 };

  it("unwraps emphasis when *** becomes **", () => {
    expect(diffMarkPieces([strong, em], "**")).toEqual({
      remove: [em],
      add: [],
    });
  });

  it("turns ** into * by swapping strong for emphasis", () => {
    expect(diffMarkPieces([strong], "*")).toEqual({
      remove: [strong],
      add: [{ markName: "emphasis", from: 1, to: 5 }],
    });
  });

  it("unwraps math when $ is deleted", () => {
    const math = { token: "$", markName: "math" as const, from: 2, to: 3 };
    expect(diffMarkPieces([math], "")).toEqual({
      remove: [math],
      add: [],
    });
    expect(diffMarkPieces([math], "$")).toEqual({
      remove: [],
      add: [],
    });
  });

  it("removes all marks when the delimiter is empty", () => {
    expect(diffMarkPieces([strong], "")).toEqual({
      remove: [strong],
      add: [],
    });
  });

  it("keeps piece ranges after a follow-up edit", () => {
    const next = piecesAfterDiff([strong, em], "**");
    expect(next).toEqual([strong]);
    expect(diffMarkPieces(next, "*")).toEqual({
      remove: [strong],
      add: [{ markName: "emphasis", from: 1, to: 5 }],
    });
  });
});
