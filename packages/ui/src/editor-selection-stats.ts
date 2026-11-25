import type { PaneId } from "@chestnut/core";

export interface TextSelectionStats {
  kind: "text";
  totalWords: number;
  totalCharacters: number;
  selectedWords: number | null;
  selectedCharacters: number | null;
}

export interface TableSelectionStats {
  kind: "table";
  rows: number;
  columns: number;
  cells: number;
  nonEmptyCells: number;
  numericCells: number;
  sum: number | null;
  average: number | null;
}

export type EditorSelectionStats = TextSelectionStats | TableSelectionStats;

export interface PaneSelectionStats {
  leafId: string;
  stats: EditorSelectionStats;
}

export type EditorSelectionStatsByPane = Record<PaneId, PaneSelectionStats | null>;

const CJK_WORD_UNIT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Word-style count: every CJK character and every alphanumeric word is one unit. */
export function countWordUnits(text: string): number {
  let cjk = 0;
  let rest = "";
  for (const char of text) {
    if (CJK_WORD_UNIT.test(char)) {
      cjk += 1;
      rest += " ";
    } else {
      rest += char;
    }
  }
  const words =
    rest.match(
      /(?:\p{N}+(?:[.,]\p{N}+)*|[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*)/gu,
    )?.length ?? 0;
  return cjk + words;
}

/** Word's “characters (no spaces)” equivalent, counted as Unicode code points. */
export function countCharactersWithoutSpaces(text: string): number {
  let count = 0;
  for (const char of text) {
    if (!/\s/u.test(char)) count += 1;
  }
  return count;
}

/** Numbers Excel would aggregate in a text-like cell, including grouping and percentages. */
export function parseSpreadsheetNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const percent = trimmed.endsWith("%");
  const normalized = (percent ? trimmed.slice(0, -1) : trimmed).replace(/,/g, "").trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return percent ? value / 100 : value;
}

