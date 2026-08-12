import mermaid from "mermaid";

let initialized = false;
let initTheme: "default" | "dark" | null = null;
let renderSeq = 0;

function currentMermaidTheme(): "default" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default";
}

function ensureMermaidInitialized(): void {
  const theme = currentMermaidTheme();
  if (initialized && initTheme === theme) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme,
  });
  initialized = true;
  initTheme = theme;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderMermaidSvg(source: string): Promise<string> {
  ensureMermaidInitialized();
  const id = `chestnut-mermaid-${++renderSeq}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}

function errorPreview(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `<pre class="boke-mermaid-error">${escapeHtml(message)}</pre>`;
}

/**
 * Crepe / Milkdown code-block `renderPreview` for ```mermaid fences.
 * Returns `undefined` to signal async preview via `applyPreview`.
 */
export function renderMermaidCodePreview(
  language: string,
  content: string,
  applyPreview: (value: null | string | HTMLElement) => void,
): void | null {
  if (language.toLowerCase() !== "mermaid") return null;
  const source = content.trim();
  if (!source) return null;

  const expected = source;
  void (async () => {
    try {
      const svg = await renderMermaidSvg(expected);
      applyPreview(svg);
    } catch (err) {
      applyPreview(errorPreview(err));
    }
  })();
}

/** Render mermaid fences inside HTML produced by markdown-it (PDF / publish). */
export async function hydrateMermaidInHtml(html: string): Promise<string> {
  if (!html.includes("language-mermaid") && !/class="mermaid"/i.test(html)) {
    return html;
  }

  const doc = new DOMParser().parseFromString(`<div id="boke-md-root">${html}</div>`, "text/html");
  const root = doc.getElementById("boke-md-root");
  if (!root) return html;

  const blocks = [
    ...root.querySelectorAll("pre > code.language-mermaid"),
    ...root.querySelectorAll("code.language-mermaid"),
    ...root.querySelectorAll(".mermaid"),
  ];
  const seen = new Set<Element>();

  for (const el of blocks) {
    const code = el.tagName === "CODE" ? el : el.querySelector("code") ?? el;
    if (seen.has(code)) continue;
    seen.add(code);
    const source = (code.textContent ?? "").trim();
    if (!source) continue;

    const host = document.createElement("div");
    host.className = "boke-mermaid-diagram";
    try {
      host.innerHTML = await renderMermaidSvg(source);
    } catch (err) {
      host.innerHTML = errorPreview(err);
    }

    const pre = code.closest("pre");
    (pre ?? code).replaceWith(host);
  }

  return root.innerHTML;
}
