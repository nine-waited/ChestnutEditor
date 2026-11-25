const MATCH_HIGHLIGHT = "chestnut-find-match";
const CURRENT_HIGHLIGHT = "chestnut-find-current";

interface OwnerRanges {
  all: Range[];
  current: Range | null;
}

const owners = new Map<object, OwnerRanges>();

function highlightApi(): { registry: HighlightRegistry; Ctor: typeof Highlight } | null {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return null;
  return { registry: CSS.highlights, Ctor: Highlight };
}

function sync(): void {
  const api = highlightApi();
  if (!api) return;
  const all: Range[] = [];
  const current: Range[] = [];
  for (const entry of owners.values()) {
    all.push(...entry.all);
    if (entry.current) current.push(entry.current);
  }
  if (all.length === 0) api.registry.delete(MATCH_HIGHLIGHT);
  else api.registry.set(MATCH_HIGHLIGHT, new api.Ctor(...all));
  if (current.length === 0) {
    api.registry.delete(CURRENT_HIGHLIGHT);
  } else {
    const highlight = new api.Ctor(...current);
    highlight.priority = 1;
    api.registry.set(CURRENT_HIGHLIGHT, highlight);
  }
}

/** CSS Custom Highlight ranges, shared across panes and keyed by owner. */
export function setFindHighlights(owner: object, all: Range[], current: Range | null): void {
  owners.set(owner, { all, current });
  sync();
}

export function clearFindHighlights(owner: object): void {
  if (!owners.delete(owner)) return;
  sync();
}
