const FENCE_OPEN_RE = /^(`{3,}|~{3,})/;
const DELIMITER_CELL_RE = /^\s*:?-+:?\s*$/;

/**
 * Escape `|` that is not already escaped. Used when serializing table cells
 * and when rewriting overflow GFM rows so they keep the intended column count.
 */
export function escapeUnescapedTablePipes(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length) {
      out += ch + text[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      out += "\\|";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Split a GFM table row on unescaped pipes, dropping the optional edge pipes. */
export function splitGfmTableRow(line: string): string[] {
  const raw = line.trim();
  if (!raw) return [];
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      current += ch + raw[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  if (raw.startsWith("|")) cells.shift();
  if (raw.endsWith("|") && cells.length > 0 && cells[cells.length - 1]!.trim() === "") {
    cells.pop();
  }
  return cells;
}

export function isGfmTableDelimiterLine(line: string): boolean {
  const cells = splitGfmTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => DELIMITER_CELL_RE.test(cell)) && cells.some((cell) => cell.includes("-"));
}

function isGfmTableRowLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("```") || trimmed.startsWith("~~~")) return false;
  return trimmed.includes("|");
}

function looksLikeInlinePipe(left: string, right: string): boolean {
  const leftTail = left.trimEnd();
  const rightHead = right.trimStart();
  if (!leftTail || !rightHead) return false;
  if (/[)]$/.test(leftTail) && /^[\d\w]/.test(rightHead)) return true;
  if (/(?:<<|>>|&|\^)$/.test(leftTail)) return true;
  return false;
}

function formatGfmRow(cells: string[]): string {
  return `| ${cells.map(escapeUnescapedTablePipes).join(" | ")} |`;
}

function fitCellsToWidth(cells: string[], colCount: number): string[] {
  const next = cells.slice();
  while (next.length > colCount) {
    let mergeAt = -1;
    for (let i = 0; i < next.length - 1; i++) {
      if (looksLikeInlinePipe(next[i]!, next[i + 1]!)) {
        mergeAt = i;
        break;
      }
    }
    if (mergeAt < 0) mergeAt = Math.max(0, colCount - 1);
    if (mergeAt > next.length - 2) mergeAt = next.length - 2;
    next.splice(mergeAt, 2, `${next[mergeAt]}|${next[mergeAt + 1]}`);
  }
  while (next.length < colCount) next.push("");
  return next;
}

function tightPipePositions(line: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      i++;
      continue;
    }
    if (ch !== "|") continue;
    const prev = line[i - 1];
    const next = line[i + 1];
    if (prev && next && !/\s/.test(prev) && !/\s/.test(next)) {
      positions.push(i);
    }
  }
  return positions;
}

function prefersExpressionPipe(line: string, pos: number): boolean {
  const prev = line[pos - 1];
  const next = line[pos + 1];
  return prev === ")" || (Boolean(prev && /[\w\d]/.test(prev) && next && /\d/.test(next)));
}

/**
 * When a row has more unescaped pipes than `colCount`, escape the extras that
 * look like cell content (`(1<<1)|0`) instead of dropping columns.
 */
export function escapeOverflowPipesInGfmRow(line: string, colCount: number): string {
  const cells = splitGfmTableRow(line);
  if (cells.length <= colCount) return line;
  const overflow = cells.length - colCount;
  const tight = tightPipePositions(line);
  if (tight.length === 0) return formatGfmRow(fitCellsToWidth(cells, colCount));

  const ranked = tight.filter((pos) => prefersExpressionPipe(line, pos));
  const chosen = (ranked.length >= overflow ? ranked : tight).slice(0, overflow);
  const escapeAt = new Set(chosen);
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && i + 1 < line.length) {
      out += ch + line[i + 1];
      i++;
      continue;
    }
    if (ch === "|" && escapeAt.has(i)) {
      out += "\\|";
      continue;
    }
    out += ch;
  }
  if (splitGfmTableRow(out).length > colCount) {
    return formatGfmRow(fitCellsToWidth(splitGfmTableRow(out), colCount));
  }
  return out;
}

/**
 * Rewrite GFM tables whose header/body rows have extra unescaped `|` compared
 * with the delimiter, so micromark still recognizes a table instead of a paragraph.
 */
export function sanitizeGfmTablePipes(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let fenceMarker: string | null = null;
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimStart();
    const fenceMatch = trimmed.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!;
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
    if (i + 1 >= lines.length) continue;
    if (!isGfmTableRowLine(lines[i]!) || !isGfmTableDelimiterLine(lines[i + 1]!)) continue;

    const colCount = splitGfmTableRow(lines[i + 1]!).length;
    if (colCount < 1) continue;

    const rewritten = escapeOverflowPipesInGfmRow(lines[i]!, colCount);
    if (rewritten !== lines[i]) {
      lines[i] = rewritten;
      changed = true;
    }

    let row = i + 2;
    while (row < lines.length) {
      if (lines[row]!.trimStart().match(FENCE_OPEN_RE)) break;
      if (!isGfmTableRowLine(lines[row]!)) break;
      if (isGfmTableDelimiterLine(lines[row]!)) break;
      const next = escapeOverflowPipesInGfmRow(lines[row]!, colCount);
      if (next !== lines[row]) {
        lines[row] = next;
        changed = true;
      }
      row += 1;
    }
    i = row - 1;
  }

  return changed ? lines.join("\n") : markdown;
}
