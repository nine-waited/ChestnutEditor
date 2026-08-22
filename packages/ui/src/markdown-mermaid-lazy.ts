type MermaidApplyPreview = (value: null | string | HTMLElement) => void;

/**
 * Crepe code-block `renderPreview` shim: only loads mermaid when a ```mermaid fence renders.
 */
export function lazyRenderMermaidCodePreview(
  language: string,
  content: string,
  applyPreview: MermaidApplyPreview,
): void | null {
  const lang = String(language ?? "").trim().toLowerCase();
  if (lang !== "mermaid") return null;
  const source = content.trim();
  if (!source) return null;

  void import("./markdown-mermaid-preview.js").then(({ renderMermaidCodePreview }) => {
    renderMermaidCodePreview(language, content, applyPreview);
  });
  return undefined;
}
