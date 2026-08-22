import { useEffect, useRef } from "react";
import { renderMarkdown, attachPreviewHandlers, hydrateEmbedImages } from "../markdown.js";

interface MarkdownPreviewProps {
  content: string;
  path: string;
}

function markdownNeedsMermaid(content: string, html: string): boolean {
  return /```mermaid\b/i.test(content) || html.includes("language-mermaid") || /class="mermaid"/i.test(html);
}

export function MarkdownPreview({ content, path }: MarkdownPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const el = ref.current;
    void (async () => {
      let html = renderMarkdown(content);
      if (markdownNeedsMermaid(content, html)) {
        const { hydrateMermaidInHtml } = await import("../markdown-mermaid-preview.js");
        html = await hydrateMermaidInHtml(html);
      }
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = html;
      attachPreviewHandlers(ref.current, path);
      await hydrateEmbedImages(ref.current, path);
    })();
    return () => {
      cancelled = true;
    };
  }, [content, path]);

  return <div ref={ref} className="boke-markdown-preview" />;
}
