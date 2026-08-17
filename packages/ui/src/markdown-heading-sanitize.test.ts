import { describe, expect, it } from "vitest";
import {
  escapeHeadingInlineMarkers,
  headingDisplayText,
  sanitizeHeadingTitle,
  sanitizeHeadingTitleOnPromote,
  sanitizeMarkdownHeadingLines,
} from "./markdown-heading-sanitize.js";

describe("markdown-heading-sanitize", () => {
  it("on promote: strips wraps then escapes leftovers", () => {
    expect(sanitizeHeadingTitleOnPromote("**Hello** *world* ==hi==")).toBe("Hello world hi");
    expect(sanitizeHeadingTitleOnPromote("`code` and **x**")).toBe("code and x");
  });

  it("already a heading: escape ** and backticks, do not strip", () => {
    expect(sanitizeHeadingTitle("**sla**")).toBe("\\*\\*sla\\*\\*");
    expect(sanitizeHeadingTitle("`code`")).toBe("\\`code\\`");
    expect(sanitizeHeadingTitle("a_b_c")).toBe("a\\_b\\_c");
  });

  it("outline shows ** and backticks after unescape", () => {
    expect(headingDisplayText("\\*\\*sla\\*\\*")).toBe("**sla**");
    expect(headingDisplayText("\\`code\\`")).toBe("`code`");
    expect(headingDisplayText("**sla**，sda_sdasjl_sads")).toBe("**sla**，sda_sdasjl_sads");
  });

  it("document sanitize escapes heading lines only", () => {
    const out = sanitizeMarkdownHeadingLines(`# **sla**

\`\`\`
# **keep**
\`\`\`
`);
    expect(out).toContain("# \\*\\*sla\\*\\*\n");
    expect(out).toContain("# **keep**");
  });

  it("does not double-escape", () => {
    expect(escapeHeadingInlineMarkers("a \\* b")).toBe("a \\* b");
  });
});
