import { useEffect, useState } from "react";
import { useT } from "../i18n/index.js";
import { renderMarkdown } from "../markdown.js";
import { vaultService } from "../store.js";

interface PublishNote {
  path: string;
  title: string;
  slug: string;
  date: string;
  tags: string[];
}

export function PublishPanel() {
  const t = useT();
  const [notes, setNotes] = useState<PublishNote[]>([]);
  const [exportHtml, setExportHtml] = useState("");
  const [rss, setRss] = useState("");

  useEffect(() => {
    vaultService.getPublishableNotes().then(setNotes);
  }, []);

  const buildSite = async () => {
    const items: string[] = [];
    const rssItems: string[] = [];
    const baseUrl = "https://example.com";

    for (const note of notes) {
      const content = await vaultService.read(note.path);
      const { hydrateMermaidInHtml } = await import("../markdown-mermaid-preview.js");
      const body = await hydrateMermaidInHtml(renderMarkdown(content));
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(note.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.7; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    .tag { color: #7c3aed; margin-right: 0.5rem; }
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(note.title)}</h1>
    <div class="meta">${note.date} · ${note.tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join(" ")}</div>
    ${body}
  </article>
</body>
</html>`;
      items.push(`<!-- ${note.slug}.html -->\n${html}`);
      rssItems.push(`    <item>
      <title>${escapeXml(note.title)}</title>
      <link>${baseUrl}/${note.slug}.html</link>
      <guid>${baseUrl}/${note.slug}.html</guid>
      <pubDate>${new Date(note.date).toUTCString()}</pubDate>
    </item>`);
    }

    const index = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Knowledge Blog</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
    li { margin: 0.75rem 0; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>Knowledge Blog</h1>
  <ul>
    ${notes.map((n) => `<li><a href="${n.slug}.html">${escapeHtml(n.title)}</a> <small>${n.date}</small></li>`).join("\n    ")}
  </ul>
</body>
</html>`;

    setExportHtml([index, ...items].join("\n\n---\n\n"));
    setRss(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Knowledge Blog</title>
    <link>${baseUrl}</link>
    <description>Published notes from Chestnut Editor</description>
${rssItems.join("\n")}
  </channel>
</rss>`);
  };

  const downloadBundle = () => {
    const blob = new Blob([exportHtml], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "boke-site-export.txt";
    a.click();
  };

  return (
    <div className="boke-publish">
      <h2>{t("publish.title")}</h2>
      <p style={{ color: "var(--boke-text-muted)" }}>{t("publish.hint")}</p>

      <h3>{t("publish.listTitle", { count: notes.length })}</h3>
      <ul>
        {notes.map((n) => (
          <li key={n.path}>
            <strong>{n.title}</strong> — {n.date} — <code>{n.slug}</code>
          </li>
        ))}
      </ul>

      <button onClick={buildSite}>{t("publish.generate")}</button>
      {exportHtml && (
        <>
          <button onClick={downloadBundle} style={{ marginLeft: 8 }}>
            {t("publish.download")}
          </button>
          <h3>{t("publish.previewTitle")}</h3>
          <pre>{exportHtml.slice(0, 4000)}{exportHtml.length > 4000 ? "\n…" : ""}</pre>
          <h3>{t("publish.rssTitle")}</h3>
          <pre>{rss}</pre>
        </>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeXml(s: string): string {
  return escapeHtml(s);
}
