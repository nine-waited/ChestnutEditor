import { useMemo } from "react";
import { extractHeadings, type OutlineHeading } from "../markdown-outline.js";
import { headingDisplayText } from "../markdown-heading-sanitize.js";
import { useT } from "../i18n/index.js";

interface OutlinePanelProps {
  path: string;
  content: string;
  onHeadingClick?: (heading: OutlineHeading) => void;
}

export function OutlinePanel({ path, content, onHeadingClick }: OutlinePanelProps) {
  const t = useT();
  const headings = useMemo(() => extractHeadings(path, content), [path, content]);

  return (
    <aside className="chestnut-note-toc">
      <div className="chestnut-note-toc-title">{t("note.outlineTitle")}</div>
      {headings.length === 0 ? (
        <p className="chestnut-note-toc-empty">{t("note.outlineEmpty")}</p>
      ) : (
        <nav className="chestnut-note-toc-list">
          {headings.map((heading, index) => {
            const label = headingDisplayText(heading.text);
            return (
              <button
                key={`${heading.docLine}-${heading.text}-${index}`}
                type="button"
                className="chestnut-note-toc-item"
                data-level={heading.level}
                style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                onClick={() => onHeadingClick?.(heading)}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
