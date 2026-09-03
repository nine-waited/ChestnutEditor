import {
  formatMarkdownImageRef,
  isAbsoluteFilesystemImagePath,
  isRemoteMarkdownImageRef,
  normalizeMarkdownAssetRef,
  notePicMarkdownPrefixFromNote,
  parseCloudAttachmentVaultPath,
  resolvePathSegments,
  suggestedImageFileNameFromRef,
  transformMarkdownImageRefs,
} from "./note-images.js";
import { isImage } from "./types.js";

export type ImportableImageRef =
  | { kind: "local"; relativePath: string; fileName: string }
  | { kind: "local-abs"; absPath: string; fileName: string }
  | { kind: "remote"; url: string; suggestedFileName: string };

/** Relative image path next to the markdown file, e.g. `image.png` or `Note_pic/a.png`. */
export function resolveBundleImageRelativePath(ref: string): string | null {
  const raw = normalizeMarkdownAssetRef(ref);
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return null;
  }

  const norm = resolvePathSegments(raw);
  if (!norm || /^https?:\/\//i.test(norm) || norm.startsWith("data:") || norm.startsWith("blob:")) {
    return null;
  }
  if (/^[a-zA-Z]:\//.test(norm)) return null;

  const fileName = norm.split("/").pop() ?? "";
  return fileName && isImage(fileName) ? norm : null;
}

/** File name from a same-directory markdown image ref, e.g. `image.png` or `./image.png`. */
export function resolveBundleImageFileName(ref: string): string | null {
  const relative = resolveBundleImageRelativePath(ref);
  if (!relative) return null;
  return relative.split("/").pop() ?? relative;
}

export function resolveImportableImageRef(ref: string): ImportableImageRef | null {
  const relativePath = resolveBundleImageRelativePath(ref);
  if (relativePath) {
    return {
      kind: "local",
      relativePath,
      fileName: relativePath.split("/").pop() ?? relativePath,
    };
  }

  if (isAbsoluteFilesystemImagePath(ref)) {
    const absPath = normalizeMarkdownAssetRef(ref);
    return {
      kind: "local-abs",
      absPath,
      fileName: suggestedImageFileNameFromRef(ref),
    };
  }

  const attachmentPath = parseCloudAttachmentVaultPath(ref);
  if (attachmentPath || isRemoteMarkdownImageRef(ref)) {
    const url = normalizeMarkdownAssetRef(ref);
    const suggestedFileName =
      attachmentPath?.split("/").pop() ?? suggestedImageFileNameFromRef(ref);
    return { kind: "remote", url, suggestedFileName };
  }

  return null;
}

/** Pick the markdown file in a flat bundle folder, preferring `{folderName}.md`. */
export function selectBundleMarkdownFile(mdFileNames: string[], folderName: string): string | null {
  if (mdFileNames.length === 0) return null;
  const match = mdFileNames.find((name) => name.replace(/\.md$/i, "") === folderName);
  return match ?? mdFileNames[0] ?? null;
}

export function notePicMarkdownPrefix(mdPath: string): string {
  return notePicMarkdownPrefixFromNote(mdPath);
}

export function rewriteBundleImagesForNote(
  content: string,
  picMarkdownPrefix: string,
  fileNameMap: ReadonlyMap<string, string>,
): string {
  return transformMarkdownImageRefs(content, (ref, full) => {
    const destName = fileNameMap.get(ref);
    if (!destName) return undefined;

    const altMatch = full.match(/^!\[([^\]]*)\]/);
    const titleMatch = full.match(/\)\s*"([^"]*)"\s*\)$/);
    const alt = altMatch?.[1] ?? "";
    const title = titleMatch?.[1];
    return formatMarkdownImageRef(alt, `${picMarkdownPrefix}/${destName}`, title);
  });
}
