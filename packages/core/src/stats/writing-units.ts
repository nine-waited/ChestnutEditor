/** Count Markdown source as CJK characters + Latin/digit words. Punctuation and whitespace are 0. */
const UNIT_RE =
  /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|[A-Za-z0-9]+/gu;

export function countWritingUnits(text: string): number {
  if (!text) return 0;
  const matches = text.match(UNIT_RE);
  return matches ? matches.length : 0;
}

export function localDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
