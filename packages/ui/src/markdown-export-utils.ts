import { absolutePathToVaultRelative, isImage, normalizeMarkdownAssetRef, normalizePath } from "@chestnut/core";
import { renderMarkdown } from "./markdown.js";
import { resolveImageVaultPath } from "./image-open.js";
import { vaultService } from "./store.js";
import { getUiFontStack } from "./ui-font.js";
import type { UiFont } from "./ui-font.js";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function mimeFromImagePath(path: string): string {
  switch (path.split(".").pop()?.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    default:
      return "image/png";
  }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function vaultRootPath(): string | null {
  const adapter = vaultService.getAdapter();
  if (!adapter || adapter.kind !== "tauri" || !("getRootPath" in adapter)) return null;
  return (adapter as { getRootPath(): string }).getRootPath().replace(/\\/g, "/").replace(/\/$/, "");
}

/** Resolve a vault-relative image path for export (embed, markdown src, absolute path). */
export function resolveExportImageVaultPath(
  embed: string | null,
  src: string | null,
  notePath: string,
): string | null {
  const raw = embed || src;
  if (!raw) return null;

  const normalized = normalizeMarkdownAssetRef(raw);
  if (
    !normalized ||
    normalized.startsWith("blob:") ||
    normalized.startsWith("data:") ||
    /^https?:\/\//i.test(normalized)
  ) {
    return null;
  }

  const root = vaultRootPath();
  const fromNote = resolveImageVaultPath(normalized, notePath, root);
  if (fromNote) return fromNote;

  if (root) {
    const rel = absolutePathToVaultRelative(normalized, root);
    if (rel && isImage(rel)) return rel;
  }

  return null;
}

async function resolveExportImageDataUrl(
  embed: string | null,
  src: string | null,
  notePath: string,
): Promise<string | null> {
  const vaultPath = resolveExportImageVaultPath(embed, src, notePath);
  if (vaultPath) {
    const bytes = await vaultService.readBinary(vaultPath);
    return bytesToDataUrl(bytes, mimeFromImagePath(vaultPath));
  }

  const path = embed || src;
  if (!path) return null;
  if (path.startsWith("data:")) return path;

  if (/^https?:\/\//i.test(path) || path.startsWith("blob:")) {
    const response = await fetch(path);
    const blob = await response.blob();
    return blobToDataUrl(blob);
  }

  return null;
}

export async function inlineImagesForExport(html: string, notePath: string): Promise<string> {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const images = doc.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map(async (img) => {
      const embed = img.getAttribute("data-embed");
      const src = img.getAttribute("src");
      try {
        const dataUrl = await resolveExportImageDataUrl(embed, src, notePath);
        if (!dataUrl) return;
        img.setAttribute("src", dataUrl);
        img.removeAttribute("data-embed");
      } catch {
        img.setAttribute("alt", img.getAttribute("alt") ?? "Image");
        img.removeAttribute("src");
      }
    }),
  );
  return doc.body.firstElementChild?.innerHTML ?? html;
}

const LITERAL_BR_PATTERN = /<br\s*\/?>/gi;

/** Replace `<br>` tags and literal `<br />` text with real block breaks for export. */
export function normalizeLineBreaksForExport(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="boke-export-wrap">${html}</div>`, "text/html");
  const wrap = doc.getElementById("boke-export-wrap");
  if (!wrap) return html;

  wrap.querySelectorAll("br").forEach((br) => br.replaceWith(doc.createTextNode("\n")));

  const walker = doc.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    const raw = textNode.textContent ?? "";
    const cleaned = raw.replace(LITERAL_BR_PATTERN, "\n");
    if (cleaned !== raw) textNode.textContent = cleaned;
  }

  for (const p of Array.from(wrap.querySelectorAll("p"))) {
    splitBlockOnNewlines(p as HTMLParagraphElement, doc);
  }

  for (const li of Array.from(wrap.querySelectorAll("li"))) {
    splitBlockOnNewlines(li as HTMLLIElement, doc);
  }

  return wrap.innerHTML;
}

function stripNewlinesFromTextNodes(el: HTMLElement): void {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    const raw = textNode.textContent ?? "";
    const cleaned = raw.replace(/\n/g, "");
    if (cleaned !== raw) textNode.textContent = cleaned;
  }
}

function splitBlockOnNewlines(el: HTMLElement, doc: Document): void {
  const segments = splitNodesOnNewlines(Array.from(el.childNodes), doc);
  if (segments.length <= 1) {
    stripNewlinesFromTextNodes(el);
    return;
  }

  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return;

  const replacements = segments.map((nodes) => {
    const block = doc.createElement(tag);
    nodes.forEach((node) => block.appendChild(node));
    return block;
  });

  for (const block of replacements) {
    parent.insertBefore(block, el);
  }
  el.remove();
}

function splitNodesOnNewlines(nodes: Node[], doc: Document): Node[][] {
  const segments: Node[][] = [[]];

  const startNewSegment = () => {
    segments.push([]);
  };

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent ?? "").split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) startNewSegment();
        if (parts[i]) segments[segments.length - 1].push(doc.createTextNode(parts[i]));
      }
      continue;
    }
    segments[segments.length - 1].push(node.cloneNode(true));
  }

  return segments.filter((segment) => segment.length > 0);
}

export function exportBodyStyles(fontStack: string): string {
  return `
    body {
      box-sizing: border-box;
      font-family: ${fontStack};
      font-size: 14px;
      line-height: 1.7;
      color: #111827;
    }
    h1, h2, h3 {
      margin-top: 1.4em;
      margin-bottom: 0.5em;
      line-height: 1.3;
    }
    h1 { font-size: 1.65rem; margin-top: 0; }
    h2 { font-size: 1.35rem; }
    h3 { font-size: 1.15rem; }
    p { margin: 0.75em 0; }
    ul, ol { padding-left: 1.4em; margin: 0.75em 0; }
    blockquote {
      margin: 1em 0;
      padding-left: 1em;
      border-left: 3px solid #d1d5db;
      color: #4b5563;
    }
    a { color: #2563eb; text-decoration: underline; }
    code {
      font-family: Consolas, "Courier New", monospace;
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.92em;
    }
    pre {
      background: #f3f4f6;
      padding: 14px 16px;
      border-radius: 8px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    pre code { background: transparent; padding: 0; }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 8px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 6px 10px;
      text-align: left;
    }
    .wikilink, .tag { color: #7c3aed; }
  `;
}

export function pdfExportStyles(fontStack: string): string {
  return `
    .boke-pdf-export-root {
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      padding: 0;
      font-family: ${fontStack};
      font-size: 14px;
      line-height: 1.75;
      color: #111827;
      background: #ffffff;
      overflow: visible;
      overflow-wrap: break-word;
      word-wrap: break-word;
    }
    .boke-pdf-export-root h1,
    .boke-pdf-export-root h2,
    .boke-pdf-export-root h3,
    .boke-pdf-export-root h4,
    .boke-pdf-export-root h5,
    .boke-pdf-export-root h6,
    .boke-pdf-export-root p,
    .boke-pdf-export-root ul,
    .boke-pdf-export-root ol,
    .boke-pdf-export-root blockquote,
    .boke-pdf-export-root table,
    .boke-pdf-export-root img,
    .boke-pdf-export-root canvas[data-export-image="true"],
    .boke-pdf-export-root li {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .boke-pdf-export-root h1,
    .boke-pdf-export-root h2,
    .boke-pdf-export-root h3,
    .boke-pdf-export-root h4,
    .boke-pdf-export-root h5,
    .boke-pdf-export-root h6 {
      break-after: avoid;
      page-break-after: avoid;
    }
    .boke-pdf-export-root h1,
    .boke-pdf-export-root h2,
    .boke-pdf-export-root h3 {
      margin-top: 1.4em;
      margin-bottom: 0.5em;
      line-height: 1.35;
    }
    .boke-pdf-export-root h1 { font-size: 1.65rem; margin-top: 0; }
    .boke-pdf-export-root h2 { font-size: 1.35rem; }
    .boke-pdf-export-root h3 { font-size: 1.15rem; }
    .boke-pdf-export-root p {
      margin: 0.75em 0;
      orphans: 3;
      widows: 3;
    }
    .boke-pdf-export-root ul,
    .boke-pdf-export-root ol { padding-left: 1.4em; margin: 0.75em 0; }
    .boke-pdf-export-root li {
      overflow-wrap: anywhere;
    }
    .boke-pdf-export-root blockquote {
      margin: 1em 0;
      padding-left: 1em;
      border-left: 3px solid #d1d5db;
      color: #4b5563;
    }
    .boke-pdf-export-root a { color: #2563eb; text-decoration: underline; }
    .boke-pdf-export-root code {
      font-family: Consolas, "Courier New", monospace;
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.92em;
      overflow-wrap: anywhere;
    }
    .boke-pdf-export-root pre {
      background: #f3f4f6;
      padding: 14px 16px;
      border-radius: 8px;
      overflow: visible;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      break-inside: auto;
      page-break-inside: auto;
    }
    .boke-pdf-export-root pre code { background: transparent; padding: 0; }
    .boke-pdf-export-root img,
    .boke-pdf-export-root canvas[data-export-image="true"] {
      display: block;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 8px 0;
    }
    .boke-pdf-export-root table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
      table-layout: fixed;
    }
    .boke-pdf-export-root th,
    .boke-pdf-export-root td {
      border: 1px solid #e5e7eb;
      padding: 6px 10px;
      text-align: left;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .boke-pdf-export-root .wikilink,
    .boke-pdf-export-root .tag { color: #7c3aed; }
  `;
}

export function buildExportHtmlDocument(title: string, bodyHtml: string, font: UiFont): string {
  const fontStack = getUiFontStack(font);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>${exportBodyStyles(fontStack)}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${bodyHtml}
</body>
</html>`;
}

const EXPORT_IMAGE_TIMEOUT_MS = 15_000;

async function waitForSingleExportImage(img: HTMLImageElement): Promise<boolean> {
  const src = img.getAttribute("src");
  if (!src) return false;

  const waitLoaded = () =>
    new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => resolve(ok);

      if (img.complete && img.naturalWidth > 0) {
        void img.decode().then(() => finish(true), () => finish(img.naturalWidth > 0));
        return;
      }

      const timer = window.setTimeout(() => finish(img.naturalWidth > 0), EXPORT_IMAGE_TIMEOUT_MS);
      const done = (ok: boolean) => {
        window.clearTimeout(timer);
        finish(ok);
      };

      img.addEventListener(
        "load",
        () => {
          void img.decode().then(() => done(true), () => done(img.naturalWidth > 0));
        },
        { once: true },
      );
      img.addEventListener("error", () => done(false), { once: true });
    });

  if (await waitLoaded()) return true;

  // Force a reload — data URLs can report complete before pixels are ready in cloned DOM.
  img.removeAttribute("src");
  img.setAttribute("src", src);
  return waitLoaded();
}

/** Wait until export images are decoded so html2canvas can paint them. */
export async function waitForExportImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map((img) => waitForSingleExportImage(img)));
}

/**
 * Replace loaded `<img>` nodes with `<canvas>` so html2canvas does not depend on
 * re-loading images in its cloned document (avoids intermittent missing images).
 */
export function rasterizeImagesForExport(root: HTMLElement): void {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    if (!img.naturalWidth || !img.naturalHeight) continue;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.className = img.className;
    canvas.dataset.exportImage = "true";

    const displayWidth = img.clientWidth > 0 ? img.clientWidth : img.naturalWidth;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = "auto";
    canvas.style.maxWidth = "100%";

    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(img, 0, 0);

    img.replaceWith(canvas);
  }
}

export async function buildMarkdownExportBody(content: string, notePath: string): Promise<string> {
  const rendered = renderMarkdown(content);
  const { hydrateMermaidInHtml } = await import("./markdown-mermaid-preview.js");
  const withMermaid = await hydrateMermaidInHtml(rendered);
  const withImages = await inlineImagesForExport(withMermaid, notePath);
  return normalizeLineBreaksForExport(withImages);
}
