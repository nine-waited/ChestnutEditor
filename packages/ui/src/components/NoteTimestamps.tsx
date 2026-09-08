import { useEffect, useState } from "react";
import { useT } from "./i18n/index.js";
import {
  formatNoteTimestamp,
  noteTimestamps,
  type NoteTimeRecord,
} from "./note-timestamps.js";

function useNoteTimes(path: string): NoteTimeRecord {
  const [record, setRecord] = useState(() => noteTimestamps.ensure(path));

  useEffect(() => {
    const sync = () => setRecord(noteTimestamps.ensure(path));
    sync();
    return noteTimestamps.subscribe(sync);
  }, [path]);

  return record;
}

export function NoteTimestamps({ path }: { path: string }) {
  const t = useT();
  const times = useNoteTimes(path);
  return (
    <div className="chestnut-note-timestamps">
      <div>{t("note.createdAt", { time: formatNoteTimestamp(times.createdAt) })}</div>
      <div>{t("note.updatedAt", { time: formatNoteTimestamp(times.updatedAt) })}</div>
    </div>
  );
}
