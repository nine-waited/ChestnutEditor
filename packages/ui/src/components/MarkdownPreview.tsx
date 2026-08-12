import { useEffect, useRef } from "react";
import { renderMarkdown, attachPreviewHandlers, hydrateEmbedImages } from "../markdown.js";
import { hydrateMermaidInHtml } from "../markdown-mermaid-preview.js";

interface MarkdownPreviewProps {
  content: string;
  path: string;
}

export function MarkdownPreview({ content, path }: MarkdownPreviewProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const el = ref.current;
    el.innerHTML = renderMarkdown(content);
    attachPreviewHandlers(el, path);
    void (async () => {
      const withMermaid = await hydrateMermaidInHtml(el.innerHTML);
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = withMermaid;
      attachPreviewHandlers(ref.current, path);
      await hydrateEmbedImages(ref.current, path);
    })();
    return () => {
      cancelled = true;
    };
  }, [content, path]);

  return <div ref={ref} className="boke-markdown-preview" />;
}
