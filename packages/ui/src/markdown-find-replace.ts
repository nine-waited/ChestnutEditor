export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FindQuery extends FindOptions {
  text: string;
}

export interface TextMatch {
  from: number;
  to: number;
  groups: string[];
}

export interface FindState {
  count: number;
  /** Index of the current match, or -1 when there is none. */
  current: number;
  invalid: boolean;
}

export interface FindReplaceController {
  search(query: FindQuery): FindState;
  /** Re-run the last query against the latest document, keeping the current index when possible. */
  refresh(): FindState;
  move(direction: 1 | -1): FindState;
  replaceCurrent(replacement: string): FindState;
  replaceAll(replacement: string): number;
  /** Leave search: optionally select the current match in the editor. */
  finish(selectCurrent: boolean): void;
  dispose(): void;
}

export const MAX_FIND_MATCHES = 10000;

export const EMPTY_FIND_STATE: FindState = { count: 0, current: -1, invalid: false };

const WORD_CHAR = "[\\p{L}\\p{N}_]";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** null when the query is empty or not a valid regular expression. */
export function buildFindRegExp(query: FindQuery): RegExp | null {
  if (!query.text) return null;
  let source = query.regex ? query.text : escapeRegExp(query.text);
  let flags = query.caseSensitive ? "g" : "gi";
  if (query.wholeWord) {
    source = `(?<!${WORD_CHAR})(?:${source})(?!${WORD_CHAR})`;
    flags += "u";
  }
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

export function isFindQueryInvalid(query: FindQuery): boolean {
  return Boolean(query.text) && buildFindRegExp(query) === null;
}

export function findTextMatches(text: string, re: RegExp, limit = MAX_FIND_MATCHES): TextMatch[] {
  const matches: TextMatch[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (matches.length < limit && (m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    matches.push({ from: m.index, to: m.index + m[0].length, groups: m.slice(1).map((g) => g ?? "") });
  }
  return matches;
}

/** Expand `$&`, `$1`…`$99` and `$$` for regex replacements; plain mode inserts literally. */
export function expandReplacement(replacement: string, matchText: string, groups: string[], regex: boolean): string {
  if (!regex) return replacement;
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (token, ref: string) => {
    if (ref === "$") return "$";
    if (ref === "&") return matchText;
    const index = Number(ref);
    if (index >= 1 && index <= groups.length) return groups[index - 1]!;
    if (ref.length === 2) {
      const single = Number(ref[0]);
      if (single >= 1 && single <= groups.length) return groups[single - 1]! + ref[1];
    }
    return token;
  });
}

/** First match starting at or after `pos`, wrapping to the first match. */
export function matchIndexFrom(matches: readonly { from: number }[], pos: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((match) => match.from >= pos);
  return index === -1 ? 0 : index;
}

export function stepMatchIndex(count: number, current: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}
