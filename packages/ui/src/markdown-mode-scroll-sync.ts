import { headingDisplayText } from "./markdown-heading-sanitize.js";

/** Block elements used to map the live editor viewport back to a markdown line. */
export const LIVE_SCROLL_BLOCK_SELECTOR =
  "p, li, pre, blockquote, td, th, h1, h2, h3, h4, h5, h6";

export function normalizeLineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function elementScrollRatio(el: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): number {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, el.scrollTop / max));
}

export function scrollTopFromRatio(
  ratio: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  const clamped = Math.min(1, Math.max(0, ratio));
  return clamped * max;
}

export function pickFirstIntersectingIndex(
  rects: Array<{ top: number; bottom: number }>,
  viewportTop: number,
): number {
  let best = -1;
  let bestTop = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (rects[i].bottom <= viewportTop + 1) continue;
    if (rects[i].top < bestTop) {
      bestTop = rects[i].top;
      best = i;
    }
  }
  return best;
}

function bodyLineMatchesBlock(line: string, blockText: string): boolean {
  const a = normalizeLineText(line);
  const b = normalizeLineText(blockText);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function docLineFromBlock(
  markdown: string,
  blockText: string,
  occurrence: number,
  isHeading: boolean,
): number | null {
  const target = isHeading
    ? headingDisplayText(blockText)
    : normalizeLineText(blockText);
  if (!target) return null;

  const lines = markdown.split(/\r?\n/);
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (isHeading) {
      const match = raw.trim().match(/^#{1,6}\s+(.+?)\s*$/);
      if (!match) continue;
      if (headingDisplayText(match[1]) !== target) continue;
    } else if (!bodyLineMatchesBlock(raw, target)) {
      continue;
    }
    if (seen === occurrence) return i;
    seen++;
  }
  return null;
}

export function countPriorMatchingBlocks(
  blocks: Array<{ text: string; isHeading: boolean }>,
  index: number,
): number {
  const current = blocks[index];
  if (!current) return 0;
  const target = current.isHeading
    ? headingDisplayText(current.text)
    : normalizeLineText(current.text);
  if (!target) return 0;

  let seen = 0;
  for (let i = 0; i < index; i++) {
    const prev = blocks[i];
    if (!prev || prev.isHeading !== current.isHeading) continue;
    if (current.isHeading) {
      if (headingDisplayText(prev.text) === target) seen++;
    } else if (bodyLineMatchesBlock(prev.text, target)) {
      seen++;
    }
  }
  return seen;
}

export function visibleDocLineFromLiveEditor(
  view: { dom: ParentNode },
  markdown: string,
  scrollEl: Pick<Element, "getBoundingClientRect">,
): number | null {
  const viewportTop = scrollEl.getBoundingClientRect().top + 8;
  const nodes = [...view.dom.querySelectorAll(LIVE_SCROLL_BLOCK_SELECTOR)];
  const rects = nodes.map((el) => el.getBoundingClientRect());
  const idx = pickFirstIntersectingIndex(rects, viewportTop);
  if (idx < 0) return null;

  const el = nodes[idx];
  const isHeading = /^H[1-6]$/.test(el.tagName);
  const blocks = nodes.map((node) => ({
    text: node.textContent ?? "",
    isHeading: /^H[1-6]$/.test(node.tagName),
  }));
  const occurrence = countPriorMatchingBlocks(blocks, idx);
  return docLineFromBlock(markdown, el.textContent ?? "", occurrence, isHeading);
}
