/** Strip common inline Markdown / HTML formatting, leaving plain text. */
export function stripInlineMarkdownFormat(text: string): string {
  let result = text;

  result = result.replace(/<br\s*\/?>/gi, " ");
  result = result.replace(/<[^>]+>/g, "");
  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  for (let i = 0; i < 8; i++) {
    const next = result
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/___(.+?)___/g, "$1")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/==(.+?)==/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/<\/?u>/gi, "")
      .replace(/<\/?mark[^>]*>/gi, "");
    if (next === result) break;
    result = next;
  }

  return result;
}

/** Convert markdown (including block syntax) to plain text. */
export function markdownToPlainText(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(rawLine);
      continue;
    }

    let line = rawLine.replace(/^#{1,6}\s+/, "");
    line = line.replace(/^>\s?/, "");
    line = line.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "");
    line = line.replace(/^\s*[-*+]\s+/, "");
    line = line.replace(/^\s*\d+\.\s+/, "");
    line = line.replace(/^\s*\|?\s*:?-{3,}:?\s*\|.*$/, "");
    line = line.replace(/\|/g, " ");
    out.push(stripInlineMarkdownFormat(line));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
