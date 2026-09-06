function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

/**
 * Absolute file paths from a Tauri 2 drag-drop payload.
 * Ignores hover enter/over/leave; accepts `{ type: "drop", paths }` and raw `{ paths }`.
 */
export function droppedPathsFromOsDropPayload(payload: unknown): string[] {
  if (!isRecord(payload)) return [];
  const type = payload.type;
  if (type === "enter" || type === "over" || type === "leave") return [];
  if (isRecord(payload.drop)) return stringPaths(payload.drop.paths);
  return stringPaths(payload.paths);
}
