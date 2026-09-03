import { describe, expect, it } from "vitest";
import {
  notePicMarkdownPrefix,
  resolveBundleImageFileName,
  resolveBundleImageRelativePath,
  resolveImportableImageRef,
  rewriteBundleImagesForNote,
  selectBundleMarkdownFile,
} from "./markdown-bundle-import.js";

describe("resolveBundleImageFileName", () => {
  it("accepts bare and ./ relative image names", () => {
    expect(resolveBundleImageFileName("image.png")).toBe("image.png");
    expect(resolveBundleImageFileName("./image-260707003411.png")).toBe("image-260707003411.png");
  });

  it("ignores remote urls", () => {
    expect(resolveBundleImageFileName("https://example.com/a.png")).toBeNull();
  });
});

describe("resolveBundleImageRelativePath", () => {
  it("keeps same-directory _pic subfolders", () => {
    expect(resolveBundleImageRelativePath("MyNote_pic/a.png")).toBe("MyNote_pic/a.png");
    expect(resolveBundleImageRelativePath("./images/photo.jpg")).toBe("images/photo.jpg");
  });
});

describe("selectBundleMarkdownFile", () => {
  it("prefers a markdown file matching the folder name", () => {
    expect(selectBundleMarkdownFile(["Other.md", "MyNote.md"], "MyNote")).toBe("MyNote.md");
    expect(selectBundleMarkdownFile(["Other.md"], "MyNote")).toBe("Other.md");
  });
});

describe("rewriteBundleImagesForNote", () => {
  it("rewrites same-directory refs to note _pic paths", () => {
    const map = new Map([["image.png", "image.png"]]);
    const next = rewriteBundleImagesForNote(
      "![1.00](image.png)",
      "MyNote_pic",
      map,
    );
    expect(next).toBe("![1.00](MyNote_pic/image.png)");
  });

  it("rewrites remote refs keyed by full url", () => {
    const url = "https://cdn.example.com/photo.png";
    const map = new Map([[url, "photo.png"]]);
    const next = rewriteBundleImagesForNote(
      `![alt](${url})`,
      "MyNote_pic",
      map,
    );
    expect(next).toBe("![alt](MyNote_pic/photo.png)");
  });
});

describe("resolveImportableImageRef", () => {
  it("accepts local bundle image names", () => {
    expect(resolveImportableImageRef("image.png")).toEqual({
      kind: "local",
      relativePath: "image.png",
      fileName: "image.png",
    });
  });

  it("accepts sibling _pic relative paths", () => {
    expect(resolveImportableImageRef("MyNote_pic/a.png")).toEqual({
      kind: "local",
      relativePath: "MyNote_pic/a.png",
      fileName: "a.png",
    });
  });

  it("accepts absolute local image paths", () => {
    expect(resolveImportableImageRef("C:/photos/a.png")).toEqual({
      kind: "local-abs",
      absPath: "C:/photos/a.png",
      fileName: "a.png",
    });
  });

  it("accepts cloud attachment urls", () => {
    const ref = "https://cloud.example/attachments/default/notes/foo_pic/a.png?token=abc";
    expect(resolveImportableImageRef(ref)).toEqual({
      kind: "remote",
      url: ref,
      suggestedFileName: "a.png",
    });
  });

  it("accepts generic remote urls", () => {
    const ref = "https://cdn.example.com/images/photo.jpg";
    expect(resolveImportableImageRef(ref)).toEqual({
      kind: "remote",
      url: ref,
      suggestedFileName: "photo.jpg",
    });
  });
});

describe("notePicMarkdownPrefix", () => {
  it("derives the markdown prefix from the note path", () => {
    expect(notePicMarkdownPrefix("notes/MyNote.md")).toBe("MyNote_pic");
  });
});
