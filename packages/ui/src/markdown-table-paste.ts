function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function looksLikeGfmTable(text: string): boolean {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  if (lines.length < 2) return false;
  if (!lines[0]!.includes("|")) return false;
  return /^\s*\|?[\s:|\-]+\|?/.test(lines[1]!);
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

function htmlTableToRows(html: string): string[][] | null {
  if (!html || !/<table[\s>]/i.test(html)) return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;
    const rows = [...table.querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("th,td")].map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
    if (rows.length === 0 || rows.every((row) => row.length === 0)) return null;
    return rows;
  } catch {
    return null;
  }
}

function tsvOrCsvToRows(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) return null;

  const hasTab = lines.some((line) => line.includes("\t"));
  const hasComma = lines.filter((line) => line.includes(",")).length >= Math.min(2, lines.length);
  if (!hasTab && !hasComma) return null;
  if (!hasTab && lines.length < 2) return null;

  const sep = hasTab ? "\t" : ",";
  const rows = lines.map((line) => line.split(sep).map((cell) => cell.trim()));
  if (rows.every((row) => row.length < 2) && rows.length < 2) return null;
  return rows;
}

/**
 * Convert Excel/HTML/TSV clipboard payload to a GFM table.
 * Returns null when the clipboard is already markdown or is not tabular.
 */
export function spreadsheetClipboardToMarkdown(text: string, html?: string): string | null {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (isGfmTableMarkdown(normalized)) return null;

  if (html) {
    const fromHtml = htmlTableToRows(html);
    if (fromHtml) return rowsToGfm(fromHtml);
  }

  const fromText = tsvOrCsvToRows(normalized);
  return fromText ? rowsToGfm(fromText) : null;
}

export function isGfmTableMarkdown(text: string): boolean {
  return looksLikeGfmTable(text);
}
