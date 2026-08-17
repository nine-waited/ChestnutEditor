import { stripInlineMarkdownFormat } from "./markdown-strip-inline.js";

/**
 * Escape formatting markers so `*` / `_` / `` ` `` stay literal in Markdown source.
 * Already-escaped sequences are left intact (no double-escape).
 */
export function escapeHeadingInlineMarkers(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length && /[*_~`=\\]/.test(text[i + 1])) {
      out += ch + text[i + 1];
      i++;
      continue;
    }
    if (/[*_~`=]/.test(ch)) {
      out += `\\${ch}`;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Reveal escaped markers for outline / DOM matching (`\\*` → `*`). */
export function unescapeHeadingDisplayText(text: string): string {
  return text.replace(/\\([*_~`=\\])/g, "$1");
}

/**
 * Outline label: show user-facing markers (`**`, `_`, `` ` ``).
 * Only peel backslash escapes — never strip wraps.
 */
export function headingDisplayText(text: string): string {
  return unescapeHeadingDisplayText(text).trim();
}

/**
 * Already a heading: escape format markers only (keep `**sla**`, `` `code` ``, `a_b`).
 */
export function sanitizeHeadingTitle(text: string): string {
  return escapeHeadingInlineMarkers(text);
}

/**
 * Promoting a non-heading line → heading: clear wraps, then escape leftovers.
 */
export function sanitizeHeadingTitleOnPromote(text: string): string {
  return escapeHeadingInlineMarkers(stripInlineMarkdownFormat(text));
}

const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;
const HEADING_LINE_RE = /^(#{1,6})(\s+)(.*)$/;

/**
 * Escape-only rewrite of ATX heading titles (skip fenced code).
 * Does not strip intentional `**` / `` ` `` / `_`.
 */
export function sanitizeMarkdownHeadingLines(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let fenceMarker: string | null = null;
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = null;
      }
      continue;
    }
    if (inFence) continue;

    const m = line.match(HEADING_LINE_RE);
    if (!m) continue;
    const sanitized = sanitizeHeadingTitle(m[3]);
    if (sanitized === m[3]) continue;
    lines[i] = `${m[1]}${m[2]}${sanitized}`;
    changed = true;
  }

  return changed ? lines.join("\n") : markdown;
}

/** True when a Source-mode line is an ATX heading. */
export function isAtxHeadingLine(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}
