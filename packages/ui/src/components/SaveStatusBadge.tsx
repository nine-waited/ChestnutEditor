import { useT } from "../i18n/index.js";

export type SaveIndicator = "dirty" | "saved" | "autosaved";
export type FileSaveMode = "realtime" | "interval";

export function SaveStatusBadge({
  status,
  saveMode,
}: {
  status: SaveIndicator;
  saveMode: FileSaveMode;
}) {
  const t = useT();
  const realtime = saveMode === "realtime";
  const label = realtime
    ? t("note.saveRealtime")
    : status === "dirty"
      ? t("note.saveUnsaved")
      : status === "autosaved"
        ? t("note.saveAutosaved")
        : t("note.saveSaved");
  const dirty = !realtime && status === "dirty";
  return (
    <div
      className={`boke-note-save-status${dirty ? " is-dirty" : " is-saved"}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="boke-note-save-status__icon" aria-hidden="true">
        {dirty ? (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <path
              d="M8 4.4v4.2"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="8" cy="11.15" r="0.95" fill="#fff" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <path
              d="M4.75 8.15 6.9 10.3 11.35 5.7"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="boke-note-save-status__text">{label}</span>
    </div>
  );
}
