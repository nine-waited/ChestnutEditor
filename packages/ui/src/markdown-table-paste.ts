function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function splitClipboardLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n");
}

function isGfmSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  return /^\|?[\s:|\-]+\|?$/.test(trimmed);
}

function isGfmTableRow(line: string): boolean {
  return line.includes("|");
}

/** True when the whole clipboard is a GFM table (not a document that merely starts with one). */
export function isGfmTableMarkdown(text: string): boolean {
  const lines = splitClipboardLines(text);
  if (lines.length < 2) return false;
  if (lines.some((line) => line.trim() === "")) return false;
  if (!isGfmTableRow(lines[0]!) || !isGfmSeparator(lines[1]!)) return false;
  return lines.every((line, index) => (index === 1 ? isGfmSeparator(line) : isGfmTableRow(line)));
}

/** Headings, lists, fences, or a table mixed with other blocks — paste as markdown, not a spreadsheet. */
export function looksLikeMarkdownDocument(text: string): boolean {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let markdownSignals = 0;
  let tableRows = 0;
  let proseLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) markdownSignals += 1;
    else if (/^(```|~~~)/.test(trimmed)) markdownSignals += 1;
    else if (/^>\s?/.test(trimmed)) markdownSignals += 1;
    else if (/^([-*+]|\d+\.)\s/.test(trimmed)) markdownSignals += 1;
    else if (isGfmSeparator(trimmed) || /^\|.+\|\s*$/.test(trimmed) || /\|.+\|/.test(trimmed)) {
      tableRows += 1;
    } else {
      proseLines += 1;
    }
  }
  if (markdownSignals > 0) return true;
  return tableRows >= 2 && proseLines > 0;
}

export function shouldInsertClipboardAsBlock(text: string): boolean {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (isGfmTableMarkdown(normalized) || looksLikeMarkdownDocument(normalized)) return true;
  return normalized.includes("\n\n");
}

function rowsToGfm(rows: string[][]): string | null {
  if (rows.length === 0) return null;
  const width = Math.max(1, ...rows.map((row) => row.length));
  if (width < 2 && rows.length < 2) return null;
  const normalized = rows.map((row) => {
    const cells = row.map(escapeCell);
    while (cells.length < width) cells.push("");
    return cells.slice(0, width);
  });
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const header = normalized[0]!;
  const separator = header.map(() => "---");
  const body = normalized.slice(1);
  if (body.length === 0) {
    return [line(header), line(separator), line(header.map(() => ""))].join("\n");
  }
  return [line(header), line(separator), ...body.map(line)].join("\n");
}

function htmlLooksLikeDocument(html: string): boolean {
  const withoutTables = html.replace(/<table\b[\s\S]*?<\/table>/gi, " ");
  return /<(p|h[1-6]|ul|ol|li|pre|blockquote|article)[\s>]/i.test(withoutTables);
}

function htmlTableToRows(html: string): string[][] | null {
  if (!html || !/<table[\s>]/i.test(html)) return null;
  if (htmlLooksLikeDocument(html)) return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tables = doc.querySelectorAll("table");
    if (tables.length !== 1) return null;
    const table = tables[0]!;
    const clone = table.cloneNode(true);
    table.remove();
    const leftover = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
    if (leftover) return null;
    const rows = [...(clone as HTMLTableElement).querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("th,td")].map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
    if (rows.length === 0 || rows.every((row) => row.length === 0)) return null;
    return rows;
  } catch {
    return null;
  }
}

function rowsHaveConsistentWidth(rows: string[][], minWidth: number): boolean {
  if (rows.length < 2) return false;
  const widths = rows.map((row) => row.length);
  if (widths.some((width) => width < minWidth)) return false;
  return widths.every((width) => width === widths[0]);
}

function tsvOrCsvToRows(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length < 2) return null;

  const hasTab = lines.some((line) => line.includes("\t"));
  if (!hasTab) {
    if (lines.some((line) => line.includes("|"))) return null;
    if (!lines.every((line) => line.includes(","))) return null;
  }

  const sep = hasTab ? "\t" : ",";
  const rows = lines.map((line) => line.split(sep).map((cell) => cell.trim()));
  const minWidth = hasTab ? 2 : 3;
  if (!rowsHaveConsistentWidth(rows, minWidth)) return null;
  return rows;
}

/**
 * Convert Excel/HTML/TSV clipboard payload to a GFM table.
 * Returns null when the clipboard is already markdown or is not tabular.
 */
export function spreadsheetClipboardToMarkdown(text: string, html?: string): string | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (isGfmTableMarkdown(normalized) || looksLikeMarkdownDocument(normalized)) return null;

  if (html) {
    const fromHtml = htmlTableToRows(html);
    if (fromHtml) return rowsToGfm(fromHtml);
  }

  const fromText = tsvOrCsvToRows(normalized);
  return fromText ? rowsToGfm(fromText) : null;
}

/** uTools cell paste: treat the payload as a single line of text. */
export function flattenTableCellPaste(text: string): string {
  return text.replace(/\r\n?|\n/g, " ").trim();
}
