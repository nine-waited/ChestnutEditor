import type { Ctx } from "@milkdown/ctx";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getMarkdown, markdownToSlice } from "@milkdown/utils";

const IMAGE_BLOCK_SELECTOR = [
  "[data-type=\"image-block\"]",
  "[data-node-type=\"image-block\"]",
  ".image-block",
  ".milkdown-image-block",
  ".crepe-image-block",
].join(", ");

const CAPTION_FALLBACK_CLASS = "chestnut-image-caption-fallback";

function normalizeSrcPath(src: string): string {
  return src.replace(/\\/g, "/").trim();
}

function srcPathsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

export function findImageNodeAtDom(
  view: EditorView,
  img: HTMLImageElement,
): { pos: number; nodeSize: number } | null {
  let found: { pos: number; nodeSize: number } | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.type.name.toLowerCase().includes("image")) return;
    const domNode = view.nodeDOM(pos);
    if (domNode === img || (domNode instanceof HTMLElement && domNode.contains(img))) {
      found = { pos, nodeSize: node.nodeSize };
      return false;
    }
    return undefined;
  });
  if (found) return found;

  const imgSrc = img.getAttribute("src")?.trim();
  if (!imgSrc) return null;

  view.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.type.name.toLowerCase().includes("image")) return;
    const nodeSrc = typeof node.attrs.src === "string" ? node.attrs.src.trim() : "";
    if (!nodeSrc) return;
    if (nodeSrc === imgSrc || imgSrc.endsWith(nodeSrc) || nodeSrc.endsWith(imgSrc)) {
      found = { pos, nodeSize: node.nodeSize };
      return false;
    }
    return undefined;
  });
  return found;
}

function captionAttrForNode(nodeType: string): "caption" | "alt" {
  return nodeType === "image-block" ? "caption" : "alt";
}

export function readImageCaptionFromView(view: EditorView, img: HTMLImageElement): string {
  const imageNode = findImageNodeAtDom(view, img);
  if (!imageNode) return img.getAttribute("alt")?.trim() ?? "";
  const node = view.state.doc.nodeAt(imageNode.pos);
  if (!node) return "";
  const attr = captionAttrForNode(node.type.name);
  const value = node.attrs[attr];
  return typeof value === "string" ? value : "";
}

function findImageBlockBySrc(view: EditorView, srcPath: string): HTMLElement | null {
  const targetSrc = normalizeSrcPath(srcPath);
  for (const block of view.dom.querySelectorAll<HTMLElement>(".milkdown-image-block")) {
    const img = block.querySelector("img");
    const imgSrc = img?.getAttribute("src") ?? "";
    if (srcPathsMatch(normalizeSrcPath(imgSrc), targetSrc)) return block;
  }
  return null;
}

function removeFallbackCaption(block: Element): void {
  block.querySelector(`:scope > .${CAPTION_FALLBACK_CLASS}`)?.remove();
}

/** Milkdown keeps showCaption=false after attr updates; render caption under the image ourselves. */
function ensureFallbackCaption(block: HTMLElement, caption: string): boolean {
  if (!caption) {
    removeFallbackCaption(block);
    return false;
  }

  const nativeInput = block.querySelector<HTMLInputElement>(
    `:scope > .caption-input:not(.${CAPTION_FALLBACK_CLASS})`,
  );
  if (nativeInput) {
    nativeInput.value = caption;
    removeFallbackCaption(block);
    return true;
  }

  let input = block.querySelector<HTMLInputElement>(`:scope > .${CAPTION_FALLBACK_CLASS}`);
  if (!input) {
    input = document.createElement("input");
    input.className = `caption-input ${CAPTION_FALLBACK_CLASS}`;
    input.readOnly = true;
    input.tabIndex = -1;
    input.setAttribute("aria-readonly", "true");
    block.appendChild(input);
  }
  input.value = caption;
  return false;
}

/**
 * Milkdown image-block node views always return true from update(), so Vue never
 * remounts and showCaption stays false. Delete then insert to force a fresh mount.
 */
function forceRecreateImageBlock(ctx: Ctx, view: EditorView, pos: number, nodeSize: number): void {
  const markdown = getMarkdown({ from: pos, to: pos + nodeSize })(ctx)?.trim();
  if (!markdown) return;
  const slice = markdownToSlice(markdown)(ctx);
  view.dispatch(view.state.tr.delete(pos, pos + nodeSize));
  view.dispatch(view.state.tr.replace(pos, pos, slice));
}

function scheduleCaptionVisibility(view: EditorView, srcPath: string, caption: string): void {
  const apply = () => {
    const block = findImageBlockBySrc(view, srcPath);
    if (!block) return;
    ensureFallbackCaption(block, caption);
  };

  apply();
  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

function imageBlockNeedsCaptionRemount(block: Element | null, caption: string): boolean {
  if (!caption || !block) return false;
  const native = block.querySelector<HTMLElement>(
    `:scope > .caption-input:not(.${CAPTION_FALLBACK_CLASS})`,
  );
  return !native;
}

export function syncImageCaptionDom(img: HTMLImageElement, caption: string): void {
  img.setAttribute("alt", caption);
  const block = img.closest(IMAGE_BLOCK_SELECTOR);
  if (!(block instanceof HTMLElement)) return;
  ensureFallbackCaption(block, caption);
}

export function updateImageCaptionInView(
  ctx: Ctx,
  view: EditorView,
  img: HTMLImageElement,
  caption: string,
): boolean {
  const imageNode = findImageNodeAtDom(view, img);
  if (!imageNode) return false;

  const node = view.state.doc.nodeAt(imageNode.pos);
  if (!node) return false;

  const attr = captionAttrForNode(node.type.name);
  const block = img.closest(IMAGE_BLOCK_SELECTOR);
  const needsRemount =
    node.type.name === "image-block" && imageBlockNeedsCaptionRemount(block, caption);
  const srcPath = String(node.attrs.src ?? "");

  if (node.attrs[attr] === caption && !needsRemount) {
    syncImageCaptionDom(img, caption);
    return true;
  }

  if (node.attrs[attr] !== caption) {
    view.dispatch(view.state.tr.setNodeAttribute(imageNode.pos, attr, caption));
  }

  if (needsRemount) {
    if (block instanceof HTMLElement) {
      ensureFallbackCaption(block, caption);
    }
    forceRecreateImageBlock(ctx, view, imageNode.pos, imageNode.nodeSize);
    scheduleCaptionVisibility(view, srcPath, caption);
    return true;
  }

  syncImageCaptionDom(img, caption);
  return true;
}

/** Force empty caption/alt on a newly inserted image so edits behave consistently. */
export function hasImageWithSrc(view: EditorView, srcPath: string): boolean {
  const targetSrc = normalizeSrcPath(srcPath);
  let found = false;
  view.state.doc.descendants((node) => {
    if (found) return false;
    if (!node.type.name.toLowerCase().includes("image")) return;
    const nodeSrc = normalizeSrcPath(String(node.attrs.src ?? ""));
    if (srcPathsMatch(nodeSrc, targetSrc)) found = true;
  });
  return found;
}

export function normalizeInsertedImageCaption(view: EditorView, srcPath: string): void {
  const targetSrc = normalizeSrcPath(srcPath);
  let tr = view.state.tr;
  let matched = false;

  view.state.doc.descendants((node, pos) => {
    if (!node.type.name.toLowerCase().includes("image")) return;
    const nodeSrc = normalizeSrcPath(String(node.attrs.src ?? ""));
    if (!srcPathsMatch(nodeSrc, targetSrc)) return;
    const attr = captionAttrForNode(node.type.name);
    matched = true;
    tr = tr.setNodeAttribute(pos, attr, "");
  });

  if (matched) {
    view.dispatch(tr);
  }

  for (const img of view.dom.querySelectorAll<HTMLImageElement>(`${IMAGE_BLOCK_SELECTOR} img`)) {
    const node = findImageNodeAtDom(view, img);
    if (!node) continue;
    const docNode = view.state.doc.nodeAt(node.pos);
    if (!docNode) continue;
    const nodeSrc = normalizeSrcPath(String(docNode.attrs.src ?? ""));
    if (!srcPathsMatch(nodeSrc, targetSrc)) continue;
    syncImageCaptionDom(img, "");
  }
}
