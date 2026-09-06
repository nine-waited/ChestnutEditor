export type HintMarkName =
  | "strong"
  | "emphasis"
  | "inlineCode"
  | "strike_through"
  | "highlight";

export interface HintMarkPiece {
  token: string;
  markName: HintMarkName;
  from: number;
  to: number;
}

export interface TokenTextEdit {
  text: string;
  offset: number;
}

const DELIM_TABLE: Array<{ token: string; markName: HintMarkName }> = [
  { token: "~~", markName: "strike_through" },
  { token: "==", markName: "highlight" },
  { token: "**", markName: "strong" },
  { token: "__", markName: "strong" },
  { token: "*", markName: "emphasis" },
  { token: "_", markName: "emphasis" },
  { token: "`", markName: "inlineCode" },
];

export function parseDelimTokens(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const hit = DELIM_TABLE.find((row) => rest.startsWith(row.token));
    if (!hit) {
      i += 1;
      continue;
    }
    tokens.push(hit.token === "__" ? "**" : hit.token === "_" ? "*" : hit.token);
    i += hit.token.length;
  }
  return tokens;
}

export function markNameForToken(token: string): HintMarkName | null {
  if (token === "**" || token === "__") return "strong";
  if (token === "*" || token === "_") return "emphasis";
  if (token === "~~") return "strike_through";
  if (token === "`") return "inlineCode";
  if (token === "==") return "highlight";
  return null;
}

export function isDelimiterInsertChar(char: string): boolean {
  return char.length === 1 && /[*_~=`#]/.test(char);
}

export function editTokenText(
  text: string,
  offset: number,
  action: { type: "backspace" } | { type: "delete" } | { type: "insert"; char: string },
): TokenTextEdit {
  const pos = Math.max(0, Math.min(offset, text.length));
  if (action.type === "backspace") {
    if (pos <= 0) return { text, offset: pos };
    return { text: text.slice(0, pos - 1) + text.slice(pos), offset: pos - 1 };
  }
  if (action.type === "delete") {
    if (pos >= text.length) return { text, offset: pos };
    return { text: text.slice(0, pos) + text.slice(pos + 1), offset: pos };
  }
  const char = action.char;
  if (!char) return { text, offset: pos };
  return { text: text.slice(0, pos) + char + text.slice(pos), offset: pos + char.length };
}

/** Heading widget shows hashes + a trailing space; the space is not part of the edit buffer. */
export function headingHashText(level: number): string {
  return "#".repeat(Math.min(6, Math.max(0, level)));
}

export function headingHintDisplayText(level: number): string {
  const hashes = headingHashText(level);
  return hashes ? `${hashes} ` : "";
}

export function parseHeadingHashText(text: string): { level: number; extra: string } {
  let level = 0;
  while (level < text.length && text[level] === "#" && level < 6) level += 1;
  const extra = text.slice(level).replace(/^#+/, "");
  return { level, extra };
}

export interface MarkDiff {
  remove: HintMarkPiece[];
  add: Array<{ markName: HintMarkName; from: number; to: number }>;
}

export function tokenForMarkName(name: HintMarkName): string {
  switch (name) {
    case "strong":
      return "**";
    case "emphasis":
      return "*";
    case "strike_through":
      return "~~";
    case "inlineCode":
      return "`";
    case "highlight":
      return "==";
  }
}

export function piecesAfterDiff(pieces: readonly HintMarkPiece[], newText: string): HintMarkPiece[] {
  const { remove, add } = diffMarkPieces(pieces, newText);
  const removed = new Set(remove.map((piece) => piece.markName));
  const next = pieces.filter((piece) => !removed.has(piece.markName));
  for (const piece of add) {
    next.push({
      token: tokenForMarkName(piece.markName),
      markName: piece.markName,
      from: piece.from,
      to: piece.to,
    });
  }
  return next;
}

export function diffMarkPieces(pieces: readonly HintMarkPiece[], newText: string): MarkDiff {
  const oldByMark = new Map<HintMarkName, HintMarkPiece>();
  for (const piece of pieces) {
    if (!oldByMark.has(piece.markName)) oldByMark.set(piece.markName, piece);
  }

  const newNames = new Set<HintMarkName>();
  for (const token of parseDelimTokens(newText)) {
    const name = markNameForToken(token);
    if (name) newNames.add(name);
  }

  const remove: HintMarkPiece[] = [];
  for (const [name, piece] of oldByMark) {
    if (!newNames.has(name)) remove.push(piece);
  }

  const unionFrom = pieces.reduce((min, piece) => Math.min(min, piece.from), pieces[0]?.from ?? 0);
  const unionTo = pieces.reduce((max, piece) => Math.max(max, piece.to), pieces[0]?.to ?? 0);
  const add: MarkDiff["add"] = [];
  for (const name of newNames) {
    if (!oldByMark.has(name)) add.push({ markName: name, from: unionFrom, to: unionTo });
  }

  return { remove, add };
}

export function clickOffsetFromClientX(target: EventTarget | null, clientX: number, length: number): number {
  if (!(target instanceof HTMLElement)) return length;
  if (target.closest("[data-hint-end]")) return length;
  const indexed = target.closest("[data-hint-index]");
  const indexAttr = indexed?.getAttribute("data-hint-index");
  if (indexAttr == null || !(indexed instanceof HTMLElement)) {
    const host = target.closest(".boke-live-source-hint, .boke-heading-prefix-hint");
    if (!(host instanceof HTMLElement)) return length;
    const rect = host.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? 0 : length;
  }
  const index = Number(indexAttr);
  if (!Number.isFinite(index)) return length;
  const rect = indexed.getBoundingClientRect();
  return clientX > rect.left + rect.width / 2 ? index + 1 : index;
}
