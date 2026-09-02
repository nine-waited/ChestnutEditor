export type AppShortcutId = "quick-open" | "search";

export type EditorShortcutId =
  | "md-bold"
  | "md-italic"
  | "md-underline"
  | "md-strikethrough"
  | "md-highlight"
  | "md-heading-1"
  | "md-heading-2"
  | "md-heading-3"
  | "md-heading-4"
  | "md-heading-5"
  | "md-heading-6"
  | "md-prev-heading"
  | "md-next-heading"
  | "md-task-list"
  | "md-code-block"
  | "md-table"
  | "md-editor-zoom"
  | "md-toggle-source";

export type ShortcutId = AppShortcutId | EditorShortcutId;

export const APP_SHORTCUT_IDS: AppShortcutId[] = ["quick-open", "search"];

export const EDITOR_SHORTCUT_IDS: EditorShortcutId[] = [
  "md-bold",
  "md-italic",
  "md-underline",
  "md-strikethrough",
  "md-highlight",
  "md-heading-1",
  "md-heading-2",
  "md-heading-3",
  "md-heading-4",
  "md-heading-5",
  "md-heading-6",
  "md-prev-heading",
  "md-next-heading",
  "md-task-list",
  "md-code-block",
  "md-table",
  "md-editor-zoom",
  "md-toggle-source",
];

/** Editor shortcuts that cannot be customized in settings. */
export const FIXED_EDITOR_SHORTCUT_IDS: EditorShortcutId[] = [
  "md-prev-heading",
  "md-next-heading",
  "md-editor-zoom",
  "md-toggle-source",
];

export const CONFIGURABLE_EDITOR_SHORTCUT_IDS = EDITOR_SHORTCUT_IDS.filter(
  (id) => !FIXED_EDITOR_SHORTCUT_IDS.includes(id),
);

export type ConfigurableEditorShortcutId = (typeof CONFIGURABLE_EDITOR_SHORTCUT_IDS)[number];

export function isFixedEditorShortcut(id: ShortcutId): id is EditorShortcutId {
  return FIXED_EDITOR_SHORTCUT_IDS.includes(id as EditorShortcutId);
}

export function applyFixedEditorShortcuts(shortcuts: KeyboardShortcuts): KeyboardShortcuts {
  const next = { ...shortcuts };
  for (const id of FIXED_EDITOR_SHORTCUT_IDS) {
    next[id] = DEFAULT_SHORTCUTS[id];
  }
  return next;
}

export const SHORTCUT_IDS: ShortcutId[] = [...APP_SHORTCUT_IDS, ...EDITOR_SHORTCUT_IDS];

export const DEFAULT_SHORTCUTS: Record<ShortcutId, string> = {
  "quick-open": "Shift+Shift",
  search: "Ctrl+Shift+F",
  "md-bold": "Ctrl+B",
  "md-italic": "Ctrl+I",
  "md-underline": "Ctrl+U",
  "md-strikethrough": "Ctrl+Shift+S",
  "md-highlight": "Ctrl+Shift+H",
  "md-heading-1": "Ctrl+1",
  "md-heading-2": "Ctrl+2",
  "md-heading-3": "Ctrl+3",
  "md-heading-4": "Ctrl+4",
  "md-heading-5": "Ctrl+5",
  "md-heading-6": "Ctrl+6",
  "md-prev-heading": "Ctrl+ArrowUp",
  "md-next-heading": "Ctrl+ArrowDown",
  "md-task-list": "Ctrl+L",
  "md-code-block": "Ctrl+Shift+K",
  "md-table": "Ctrl+Shift+T",
  "md-editor-zoom": "Ctrl+Wheel",
  "md-toggle-source": "Ctrl+Tab",
};

export const DOUBLE_TAP_WINDOW_MS = 400;

export type KeyboardShortcuts = Record<ShortcutId, string>;

interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const ARROW_ALIASES: Record<string, string> = {
  "↑": "arrowup",
  "↓": "arrowdown",
  "←": "arrowleft",
  "→": "arrowright",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  arrowup: "arrowup",
  arrowdown: "arrowdown",
  arrowleft: "arrowleft",
  arrowright: "arrowright",
};

function normalizeKeyToken(token: string): string {
  const trimmed = token.trim();
  const lower = trimmed.toLowerCase();
  return ARROW_ALIASES[lower] ?? (trimmed.length === 1 ? lower : lower);
}

function parsePart(part: string): Partial<ParsedShortcut> & { key?: string } {
  const token = part.trim();
  const lower = token.toLowerCase();
  if (lower === "ctrl" || lower === "control") return { ctrl: true };
  if (lower === "shift") return { shift: true };
  if (lower === "alt" || lower === "option") return { alt: true };
  if (lower === "meta" || lower === "cmd" || lower === "command" || lower === "win") return { meta: true };
  if (lower === "wheel") return { key: "wheel" };
  return { key: normalizeKeyToken(token) };
}

export function parseShortcut(raw: string): ParsedShortcut | null {
  const parts = raw
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const parsed: ParsedShortcut = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: "",
  };

  for (const part of parts) {
    const piece = parsePart(part);
    if (piece.key !== undefined) {
      if (parsed.key) return null;
      parsed.key = piece.key;
      continue;
    }
    if (piece.ctrl) parsed.ctrl = true;
    if (piece.shift) parsed.shift = true;
    if (piece.alt) parsed.alt = true;
    if (piece.meta) parsed.meta = true;
  }

  return parsed.key ? parsed : null;
}

export function isDoubleTapShortcut(raw: string): boolean {
  return /^shift\s*\+\s*shift$/i.test(raw.trim());
}

export function isWheelShortcut(raw: string): boolean {
  return /wheel/i.test(raw);
}

export function getWheelShortcutModifiers(raw: string): { ctrl: boolean; alt: boolean; meta: boolean; shift: boolean } {
  const parsed = parseShortcut(raw);
  return {
    ctrl: parsed?.ctrl ?? true,
    alt: parsed?.alt ?? false,
    meta: parsed?.meta ?? false,
    shift: parsed?.shift ?? false,
  };
}

export function normalizeShortcut(raw: string): string {
  if (isDoubleTapShortcut(raw)) return "Shift+Shift";
  if (isWheelShortcut(raw)) {
    const parsed = parseShortcut(raw);
    if (!parsed) return raw.trim();
    const parts: string[] = [];
    if (parsed.ctrl) parts.push("Ctrl");
    if (parsed.shift) parts.push("Shift");
    if (parsed.alt) parts.push("Alt");
    if (parsed.meta) parts.push("Meta");
    parts.push("Wheel");
    return parts.join("+");
  }

  const parsed = parseShortcut(raw);
  if (!parsed) return raw.trim();

  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.shift) parts.push("Shift");
  if (parsed.alt) parts.push("Alt");
  if (parsed.meta) parts.push("Meta");

  if (parsed.key.startsWith("arrow")) {
    const arrowLabel =
      parsed.key === "arrowup"
        ? "ArrowUp"
        : parsed.key === "arrowdown"
          ? "ArrowDown"
          : parsed.key === "arrowleft"
            ? "ArrowLeft"
            : parsed.key === "arrowright"
              ? "ArrowRight"
              : parsed.key;
    parts.push(arrowLabel);
  } else if (parsed.key === "tab") {
    parts.push("Tab");
  } else {
    parts.push(parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  }
  return parts.join("+");
}

export function formatShortcutLabel(raw: string): string {
  return normalizeShortcut(raw);
}

/** Letter/digit/arrow from `event.code` so IME `Process` keys still match chords. */
export function physicalKeyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/i.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (code === "ArrowUp") return "arrowup";
  if (code === "ArrowDown") return "arrowdown";
  if (code === "ArrowLeft") return "arrowleft";
  if (code === "ArrowRight") return "arrowright";
  if (code === "Tab") return "tab";
  return null;
}

function eventShortcutKey(event: KeyboardEvent): string {
  const fromCode = physicalKeyFromCode(event.code ?? "");
  if ((event.ctrlKey || event.metaKey || event.altKey) && fromCode) return fromCode;
  const fromKey = normalizeKeyToken(event.key);
  if (fromKey === "process" || fromKey === "unidentified") return fromCode ?? fromKey;
  return fromKey;
}

export function matchesShortcut(event: KeyboardEvent, raw: string): boolean {
  if (isWheelShortcut(raw)) return false;

  const parsed = parseShortcut(raw);
  if (!parsed) return false;

  const wantsModifier = parsed.ctrl || parsed.meta;
  const hasModifier = event.ctrlKey || event.metaKey;

  return (
    hasModifier === wantsModifier &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt &&
    eventShortcutKey(event) === parsed.key
  );
}

export function matchEditorShortcut(
  event: KeyboardEvent,
  shortcuts: KeyboardShortcuts,
): EditorShortcutId | null {
  for (const id of EDITOR_SHORTCUT_IDS) {
    if (id === "md-editor-zoom" || id === "md-toggle-source") continue;
    if (matchesShortcut(event, shortcuts[id])) return id;
  }
  return null;
}

export function loadKeyboardShortcuts(saved?: Partial<KeyboardShortcuts>): KeyboardShortcuts {
  return applyFixedEditorShortcuts({
    ...DEFAULT_SHORTCUTS,
    ...saved,
  });
}

export function loadEditorKeyboardShortcuts(saved?: Partial<KeyboardShortcuts>): Record<EditorShortcutId, string> {
  const merged = loadKeyboardShortcuts(saved);
  return Object.fromEntries(EDITOR_SHORTCUT_IDS.map((id) => [id, merged[id]])) as Record<
    EditorShortcutId,
    string
  >;
}

export function loadConfigurableEditorKeyboardShortcuts(
  saved?: Partial<KeyboardShortcuts>,
): Record<ConfigurableEditorShortcutId, string> {
  const merged = loadKeyboardShortcuts(saved);
  return Object.fromEntries(CONFIGURABLE_EDITOR_SHORTCUT_IDS.map((id) => [id, merged[id]])) as Record<
    ConfigurableEditorShortcutId,
    string
  >;
}

export function loadAppKeyboardShortcuts(saved?: Partial<KeyboardShortcuts>): Record<AppShortcutId, string> {
  const merged = loadKeyboardShortcuts(saved);
  return Object.fromEntries(APP_SHORTCUT_IDS.map((id) => [id, merged[id]])) as Record<AppShortcutId, string>;
}
