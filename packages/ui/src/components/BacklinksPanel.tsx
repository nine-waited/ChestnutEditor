import { useSyncExternalStore } from "react";
import { metadataCache, workspaceStore } from "../store.js";

export function BacklinksPanel() {
  const activePath = useSyncExternalStore(
    (cb) => workspaceStore.subscribe(cb),
    () => workspaceStore.getActivePath(),
  );

  if (!activePath || !activePath.endsWith(".md")) {
    return <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>Open a note to see backlinks.</p>;
  }

  const backlinks = metadataCache.getBacklinks(activePath);

  if (backlinks.length === 0) {
    return <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>No backlinks yet.</p>;
  }

  return (
    <div>
      {backlinks.map((bl) => (
        <div
          key={bl.source}
          className="chestnut-backlink-item"
          onClick={() => workspaceStore.openFile(bl.source)}
        >
          <strong>{bl.source.split("/").pop()}</strong>
          <div style={{ color: "var(--chestnut-text-muted)", fontSize: 12 }}>
            lines: {bl.lines.join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TagsPanel() {
  const tags = metadataCache.getAllTags();

  if (tags.length === 0) {
    return <p style={{ color: "var(--chestnut-text-muted)", fontSize: 13 }}>No tags found.</p>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {tags.map((t) => (
        <span
          key={t.name}
          className="tag"
          style={{
            background: "var(--chestnut-surface)",
            padding: "4px 10px",
            borderRadius: 12,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          #{t.name} ({t.count})
        </span>
      ))}
    </div>
  );
}
