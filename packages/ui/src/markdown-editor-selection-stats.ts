import { $prose } from "@milkdown/utils";
import type { Node } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { CellSelection, selectedRect } from "@milkdown/kit/prose/tables";
import { markdownToPlainText } from "./markdown-strip-inline.js";
import {
  countCharactersWithoutSpaces,
  countWordUnits,
  parseSpreadsheetNumber,
  type EditorSelectionStats,
  type TableSelectionStats,
  type TextSelectionStats,
} from "./editor-selection-stats.js";

interface TextTotals {
  words: number;
  characters: number;
}

const liveDocumentTotals = new WeakMap<Node, TextTotals>();
const sourceDocumentTotals = new Map<string, TextTotals>();
const SOURCE_TOTAL_CACHE_LIMIT = 4;

function totalsForText(text: string): TextTotals {
  return {
    words: countWordUnits(text),
    characters: countCharactersWithoutSpaces(text),
  };
}

function textStats(
  totals: TextTotals,
  selectedText: string | null,
): TextSelectionStats {
  return {
    kind: "text",
    totalWords: totals.words,
    totalCharacters: totals.characters,
    selectedWords: selectedText == null ? null : countWordUnits(selectedText),
    selectedCharacters:
      selectedText == null ? null : countCharactersWithoutSpaces(selectedText),
  };
}

function liveTotals(state: EditorState): TextTotals {
  const cached = liveDocumentTotals.get(state.doc);
  if (cached) return cached;
  const totals = totalsForText(
    state.doc.textBetween(0, state.doc.content.size, "\n", "\n"),
  );
  liveDocumentTotals.set(state.doc, totals);
  return totals;
}

function sourceTotals(markdown: string): TextTotals {
  const cached = sourceDocumentTotals.get(markdown);
  if (cached) {
    sourceDocumentTotals.delete(markdown);
    sourceDocumentTotals.set(markdown, cached);
    return cached;
  }
  const totals = totalsForText(markdownToPlainText(markdown));
  sourceDocumentTotals.set(markdown, totals);
  if (sourceDocumentTotals.size > SOURCE_TOTAL_CACHE_LIMIT) {
    const oldest = sourceDocumentTotals.keys().next().value;
    if (oldest != null) sourceDocumentTotals.delete(oldest);
  }
  return totals;
}

function tableSelectionStats(state: EditorState): TableSelectionStats | null {
  if (!(state.selection instanceof CellSelection)) return null;
  let rect;
  try {
    rect = selectedRect(state);
  } catch {
    return null;
  }

  const positions = new Set<number>();
  const texts: string[] = [];
  for (let row = rect.top; row < rect.bottom; row += 1) {
    for (let column = rect.left; column < rect.right; column += 1) {
      const mapIndex = row * rect.map.width + column;
      const relativePos = rect.map.map[mapIndex];
      if (relativePos == null) continue;
      const pos = rect.tableStart + relativePos;
      if (positions.has(pos)) continue;
      positions.add(pos);
      texts.push(state.doc.nodeAt(pos)?.textContent.trim() ?? "");
    }
  }

  const numbers = texts
    .map(parseSpreadsheetNumber)
    .filter((value): value is number => value != null);
  const sum = numbers.length > 0 ? numbers.reduce((total, value) => total + value, 0) : null;

  return {
    kind: "table",
    rows: rect.bottom - rect.top,
    columns: rect.right - rect.left,
    cells: positions.size,
    nonEmptyCells: texts.filter(Boolean).length,
    numericCells: numbers.length,
    sum,
    average: sum == null ? null : sum / numbers.length,
  };
}

export function getLiveEditorSelectionStats(state: EditorState): EditorSelectionStats {
  const table = tableSelectionStats(state);
  if (table) return table;
  const { from, to, empty } = state.selection;
  return textStats(
    liveTotals(state),
    empty ? null : state.doc.textBetween(from, to, "\n", "\n"),
  );
}

export function getSourceEditorSelectionStats(
  markdown: string,
  from: number,
  to: number,
): TextSelectionStats {
  const selected = from === to ? null : markdown.slice(from, to);
  return textStats(
    sourceTotals(markdown),
    selected == null ? null : markdownToPlainText(selected),
  );
}

export function createLiveEditorSelectionStatsPlugin(
  publish: (stats: EditorSelectionStats) => void,
) {
  return $prose(() => {
    let lastKey = "";
    const emit = (state: EditorState): void => {
      const stats = getLiveEditorSelectionStats(state);
      const key = JSON.stringify(stats);
      if (key === lastKey) return;
      lastKey = key;
      publish(stats);
    };
    return new Plugin({
      view: (view) => {
        emit(view.state);
        return {
          update: (nextView) => emit(nextView.state),
        };
      },
    });
  });
}

