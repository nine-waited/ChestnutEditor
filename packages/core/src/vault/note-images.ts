import { isImage, joinPath, normalizePath } from "./types.js";

export const NOTE_PIC_SUFFIX = "_pic";

/** Normalize markdown image URLs: angle brackets, file://, URI encoding, slashes. */
export function normalizeMarkdownAssetRef(raw: string): string {
  let next = raw.trim();
  if (next.startsWith("<") && next.endsWith(">")) {
    next = next.slice(1, -1).trim();
  }
  next = next.replace(/\\/g, "/");

  if (/^file:/i.test(next)) {
    try {
      const url = new URL(next);
      next = decodeURIComponent(url.pathname);
      if (/^\/[a-zA-Z]:\//.test(next)) {
        next = next.slice(1);
      }
    } catch {
      next = next.replace(/^file:\/\/\/+/i, "").replace(/^file:\/\//i, "");
      try {
        next = decodeURIComponent(next);
      } catch {
        // keep decoded best-effort path
      }
    }
  } else {
    try {
      next = decodeURIComponent(next);
    } catch {
      // keep literal path
    }
  }

  return next;
}

/** Map an absolute filesystem path under `vaultRoot` to a vault-relative path. */
export function absolutePathToVaultRelative(absPath: string, vaultRoot: string): string | null {
  const norm = normalizeMarkdownAssetRef(absPath);
  const root = normalizeMarkdownAssetRef(vaultRoot).replace(/\/$/, "");
  if (!/^[a-zA-Z]:\//.test(norm) || !/^[a-zA-Z]:\//.test(root)) return null;

  const normLower = norm.toLowerCase();
  const rootLower = root.toLowerCase();
  if (normLower === rootLower) return "";
  if (!normLower.startsWith(`${rootLower}/`)) return null;

  return normalizePath(norm.slice(root.length).replace(/^\//, ""));
}

function decodeImageRef(raw: string): string {
  return normalizeMarkdownAssetRef(raw);
}

/** Directory containing the note file, e.g. `notes/sub` for `notes/sub/foo.md`. */
export function noteDirectoryPath(mdPath: string): string {
  const normalized = normalizePath(mdPath);
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash) : "";
}

/** Collapse `.` / `..` segments in a vault-relative path. */
export function resolvePathSegments(path: string): string {
  const parts = normalizePath(path).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

/**
 * Resolve an image reference from markdown against a note path.
 * Handles `foo_pic/image.png`, vault-root paths like `notes/sub/foo_pic/x.png`, and `/attachments/x.png`.
 */
export function resolveNoteImageVaultPath(imageRef: string, notePath: string): string | null {
  if (!imageRef || !notePath) return null;

  const raw = imageRef.replace(/\\/g, "/").trim();
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return null;
  }

  const norm = resolvePathSegments(decodeImageRef(imageRef));
  if (!norm || /^https?:/i.test(norm) || norm.startsWith("data:") || norm.startsWith("blob:")) {
    return null;
  }
  if (/^[a-zA-Z]:\//.test(norm)) return null;

  let vaultPath = norm;
  const noteDir = noteDirectoryPath(notePath);

  if (raw.trimStart().startsWith("/")) {
    vaultPath = norm;
  } else if (noteDir && !norm.startsWith(`${noteDir}/`)) {
    vaultPath = joinPath(noteDir, norm);
  }

  vaultPath = resolvePathSegments(vaultPath);
  return isImage(vaultPath) ? vaultPath : null;
}

export function isNotePicFolder(pathOrName: string): boolean {
  const name = pathOrName.split("/").pop() ?? pathOrName;
  return name.endsWith(NOTE_PIC_SUFFIX);
}

/** True when `path` is a `_pic` folder or nested inside one. */
export function isInNotePicFolder(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  return normalized.split("/").some((segment) => segment.endsWith(NOTE_PIC_SUFFIX));
}

function noteFileBaseName(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(md|excalidraw)$/i, "");
}

/** Vault-relative directory for a note's images, e.g. `notes/MyNote_pic`. */
export function notePicDirPath(mdPath: string): string {
  const normalized = normalizePath(mdPath);
  const slash = normalized.lastIndexOf("/");
  const dir = slash >= 0 ? normalized.slice(0, slash) : "";
  const picDirName = `${noteFileBaseName(normalized)}${NOTE_PIC_SUFFIX}`;
  return dir ? joinPath(dir, picDirName) : picDirName;
}

/** Markdown-relative `_pic` folder, e.g. `MyNote_pic` for `notes/MyNote.md`. */
export function notePicMarkdownPrefixFromNote(mdPath: string): string {
  return `${noteFileBaseName(mdPath)}${NOTE_PIC_SUFFIX}`;
}

/** Markdown-relative image dest next to the note, e.g. `MyNote_pic/a.png`. */
export function noteAdjacentPicMarkdownPath(mdPath: string, fileName: string): string {
  return `${notePicMarkdownPrefixFromNote(mdPath)}/${fileName}`;
}

export function toMarkdownAssetPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function formatImageMarkdown(imagePath: string, alt = ""): string {
  const path = toMarkdownAssetPath(imagePath);
  const dest = /[\s<>()]/.test(path) || /^[a-zA-Z]:/.test(path) ? `<${path}>` : path;
  return `![${alt}](${dest})`;
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g;

const SINGLE_MARKDOWN_IMAGE_LINE_RE =
  /^!\[[^\]]*\]\(\s*(?:<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)$/;

/** True when `text` is a single markdown image line (local path or https URL). */
export function isSingleMarkdownImageLine(text: string): boolean {
  return SINGLE_MARKDOWN_IMAGE_LINE_RE.test(text.trim());
}

/** Replace markdown image refs; return `undefined` from `transform` to keep the original syntax. */
export function transformMarkdownImageRefs(
  content: string,
  transform: (ref: string, full: string) => string | undefined,
): string {
  return content.replace(MARKDOWN_IMAGE_RE, (full, angleRef, plainRef) => {
    const ref = (angleRef ?? plainRef ?? "").trim();
    if (!ref) return full;
    return transform(ref, full) ?? full;
  });
}

export function formatMarkdownImageRef(alt: string, dest: string, title?: string): string {
  const destFormatted =
    /[\s<>()]/.test(dest) || /^[a-zA-Z]:/.test(dest) ? `<${dest}>` : dest;
  const titlePart = title ? ` "${title}"` : "";
  return `![${alt}](${destFormatted}${titlePart})`;
}

/** Extract raw image URL/path strings from markdown image syntax. */
export function extractMarkdownImageRefs(content: string): string[] {
  const refs: string[] = [];
  for (const match of content.matchAll(MARKDOWN_IMAGE_RE)) {
    const ref = (match[1] ?? match[2] ?? "").trim();
    if (ref) refs.push(ref);
  }
  return refs;
}

export function resolveMarkdownImageRefToVaultPath(
  ref: string,
  notePath: string,
  vaultRoot?: string | null,
): string | null {
  const fromNote = resolveNoteImageVaultPath(ref, notePath);
  if (fromNote) return fromNote;

  const fromAttachment = parseCloudAttachmentVaultPath(ref);
  if (fromAttachment) return fromAttachment;

  const normalized = normalizeMarkdownAssetRef(ref);
  if (/^[a-zA-Z]:\//.test(normalized)) {
    if (!vaultRoot) return null;
    const rel = absolutePathToVaultRelative(normalized, vaultRoot);
    return rel && isImage(rel) ? rel : null;
  }

  const bare = resolvePathSegments(normalized);
  if (!bare || /^https?:/i.test(bare) || /^[a-zA-Z]:\//.test(bare)) return null;
  return isImage(bare) ? bare : null;
}

export function isRemoteMarkdownImageRef(ref: string): boolean {
  const norm = normalizeMarkdownAssetRef(ref);
  return /^https?:\/\//i.test(norm);
}

export function isAbsoluteFilesystemImagePath(ref: string): boolean {
  const norm = normalizeMarkdownAssetRef(ref);
  if (!norm || /^https?:\/\//i.test(norm) || norm.startsWith("data:") || norm.startsWith("blob:")) {
    return false;
  }
  return /^[a-zA-Z]:\//.test(norm) && isImage(norm);
}

/** True when this ref already points at the current note's `_pic` folder. */
export function isManagedNotePicImageRef(
  ref: string,
  notePath: string,
  vaultRoot?: string | null,
): boolean {
  const picDir = notePicDirPath(notePath);
  const vaultPath = resolveMarkdownImageRefToVaultPath(ref, notePath, vaultRoot);
  if (vaultPath) {
    return vaultPath === picDir || vaultPath.startsWith(`${picDir}/`);
  }
  const prefix = noteFileBaseName(notePath) + NOTE_PIC_SUFFIX;
  const norm = resolvePathSegments(normalizeMarkdownAssetRef(ref));
  return norm === prefix || norm.startsWith(`${prefix}/`);
}

/** Absolute local image path that is not already in this note's `_pic`. */
export function isExternalLocalImageRef(
  ref: string,
  notePath: string,
  vaultRoot?: string | null,
): boolean {
  if (!isAbsoluteFilesystemImagePath(ref)) return false;
  return !isManagedNotePicImageRef(ref, notePath, vaultRoot);
}

export type NoteImageIngestTarget =
  | { kind: "external-local"; ref: string; absPath: string }
  | { kind: "remote"; ref: string; url: string };

export function collectNoteImageIngestTargets(
  content: string,
  notePath: string,
  vaultRoot: string | null,
  keepNetworkImageLinks: boolean,
): NoteImageIngestTarget[] {
  const seen = new Set<string>();
  const targets: NoteImageIngestTarget[] = [];
  for (const ref of extractMarkdownImageRefs(content)) {
    const key = normalizeMarkdownAssetRef(ref);
    if (!key || seen.has(key)) continue;
    if (isExternalLocalImageRef(ref, notePath, vaultRoot)) {
      seen.add(key);
      targets.push({ kind: "external-local", ref, absPath: key });
      continue;
    }
    if (!keepNetworkImageLinks && isRemoteMarkdownImageRef(ref) && !parseCloudAttachmentVaultPath(ref)) {
      seen.add(key);
      targets.push({ kind: "remote", ref, url: key });
    }
  }
  return targets;
}

export function applyMarkdownImageRefRewrites(
  content: string,
  replacements: ReadonlyMap<string, string>,
): string {
  if (replacements.size === 0) return content;
  return transformMarkdownImageRefs(content, (ref, full) => {
    const dest =
      replacements.get(ref) ?? replacements.get(normalizeMarkdownAssetRef(ref));
    if (!dest) return undefined;
    const altMatch = full.match(/^!\[([^\]]*)\]/);
    const titleMatch = full.match(/\s+"([^"]*)"\s*\)$/);
    return formatMarkdownImageRef(altMatch?.[1] ?? "", dest, titleMatch?.[1]);
  });
}

/** Parse cloud REST attachment URLs, e.g. `/attachments/default/notes/foo_pic/a.png?token=...`. */
export function parseCloudAttachmentVaultPath(ref: string): string | null {
  try {
    const raw = normalizeMarkdownAssetRef(ref);
    if (!/^https?:\/\//i.test(raw)) return null;
    const url = new URL(raw);
    const match = url.pathname.match(/^\/attachments\/[^/]+\/(.+)$/i);
    if (!match?.[1]) return null;
    const vaultPath = normalizePath(decodeURIComponent(match[1]));
    return isImage(vaultPath) ? vaultPath : null;
  } catch {
    return null;
  }
}

export function suggestedImageFileNameFromRef(ref: string): string {
  try {
    if (isRemoteMarkdownImageRef(ref)) {
      const url = new URL(normalizeMarkdownAssetRef(ref));
      const fromPath = url.pathname.split("/").pop() ?? "";
      const cleaned = fromPath.split("?")[0] ?? fromPath;
      if (cleaned && isImage(cleaned)) return sanitizeImageFileName(cleaned);
    }
  } catch {
    // fall through
  }

  const base = normalizeMarkdownAssetRef(ref).split("/").pop() ?? "image.png";
  const withoutQuery = base.split("?")[0] ?? base;
  return sanitizeImageFileName(withoutQuery || "image.png");
}

export type MarkdownImageExportSource =
  | { kind: "vault"; vaultPath: string }
  | { kind: "remote"; url: string; suggestedFileName: string }
  | { kind: "external"; absPath: string; suggestedFileName: string };

export function resolveMarkdownImageExportSource(
  ref: string,
  notePath: string,
  vaultRoot?: string | null,
): MarkdownImageExportSource | null {
  const vaultPath = resolveMarkdownImageRefToVaultPath(ref, notePath, vaultRoot);
  if (vaultPath) return { kind: "vault", vaultPath };

  if (isAbsoluteFilesystemImagePath(ref)) {
    const absPath = normalizeMarkdownAssetRef(ref);
    return {
      kind: "external",
      absPath,
      suggestedFileName: suggestedImageFileNameFromRef(ref),
    };
  }

  if (isRemoteMarkdownImageRef(ref)) {
    return {
      kind: "remote",
      url: normalizeMarkdownAssetRef(ref),
      suggestedFileName: suggestedImageFileNameFromRef(ref),
    };
  }

  return null;
}

/** True when markdown content references the given vault-relative image path. */
export function markdownReferencesImage(
  content: string,
  vaultPath: string,
  notePath: string,
  vaultRoot?: string | null,
): boolean {
  const target = normalizePath(vaultPath);
  for (const ref of extractMarkdownImageRefs(content)) {
    const resolved = resolveMarkdownImageRefToVaultPath(ref, notePath, vaultRoot);
    if (resolved && normalizePath(resolved) === target) return true;
  }
  return false;
}

export function rewriteNotePicPaths(
  content: string,
  oldPicDir: string,
  newPicDir: string,
  oldAbsPicDir: string | null,
  newAbsPicDir: string | null,
): string {
  let next = content;
  if (oldAbsPicDir && newAbsPicDir) {
    const oldAbs = toMarkdownAssetPath(oldAbsPicDir);
    const newAbs = toMarkdownAssetPath(newAbsPicDir);
    next = next.split(oldAbs).join(newAbs);
  }
  if (oldPicDir !== newPicDir) {
    next = next.split(oldPicDir).join(newPicDir);
  }
  const oldPrefix = oldPicDir.split("/").pop() ?? "";
  const newPrefix = newPicDir.split("/").pop() ?? "";
  if (oldPrefix && oldPrefix !== newPrefix) {
    next = next.split(oldPrefix).join(newPrefix);
  }
  return next;
}

/** Rewrite this note's `_pic` image links to paths relative to the markdown file. */
export function relativizeNoteImageRefs(
  content: string,
  notePath: string,
  vaultRoot?: string | null,
): string {
  const picDir = notePicDirPath(notePath);
  return transformMarkdownImageRefs(content, (ref, full) => {
    const vaultPath = resolveMarkdownImageRefToVaultPath(ref, notePath, vaultRoot);
    if (!vaultPath || vaultPath === picDir || !vaultPath.startsWith(`${picDir}/`)) {
      return undefined;
    }
    const dest = noteAdjacentPicMarkdownPath(notePath, vaultPath.slice(picDir.length + 1));
    if (normalizeMarkdownAssetRef(ref) === dest) return undefined;
    const altMatch = full.match(/^!\[([^\]]*)\]/);
    const titleMatch = full.match(/\s+"([^"]*)"\s*\)$/);
    return formatMarkdownImageRef(altMatch?.[1] ?? "", dest, titleMatch?.[1]);
  });
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".png";
  }
}

function defaultImageStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    pad(date.getFullYear() % 100) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function isGenericImageName(name: string): boolean {
  const base = name.trim().toLowerCase();
  return !base || base === "image.png" || base === "image.jpeg" || base === "image.jpg";
}

export function sanitizeImageFileName(name: string, mime = "image/png"): string {
  const trimmed = name.trim().replace(/[^\w.\-()\u4e00-\u9fff]/g, "_");
  if (isGenericImageName(trimmed)) {
    return `image-${defaultImageStamp()}${extFromMime(mime)}`;
  }
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(trimmed)) {
    return `${trimmed}${extFromMime(mime)}`;
  }
  return trimmed;
}
