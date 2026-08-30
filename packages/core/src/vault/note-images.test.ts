import { describe, expect, it } from "vitest";
import {
  absolutePathToVaultRelative,
  applyMarkdownImageRefRewrites,
  collectNoteImageIngestTargets,
  extractMarkdownImageRefs,
  isExternalLocalImageRef,
  markdownReferencesImage,
  normalizeMarkdownAssetRef,
  parseCloudAttachmentVaultPath,
  resolveMarkdownImageExportSource,
  resolveNoteImageVaultPath,
  isSingleMarkdownImageLine,
} from "./note-images.js";

describe("normalizeMarkdownAssetRef", () => {
  it("strips angle brackets and decodes spaces", () => {
    expect(
      normalizeMarkdownAssetRef("<C:/Users/x/.chestnut/New folder/Untitled 2_pic/a.png>"),
    ).toBe("C:/Users/x/.chestnut/New folder/Untitled 2_pic/a.png");
  });

  it("decodes percent-encoded paths from rendered HTML", () => {
    expect(normalizeMarkdownAssetRef("C:/Users/x/.chestnut/New%20folder/a.png")).toBe(
      "C:/Users/x/.chestnut/New folder/a.png",
    );
  });
});

describe("absolutePathToVaultRelative", () => {
  it("maps absolute paths under the vault root", () => {
    const root = "C:/Users/32476/.chestnut/New folder";
    const abs = "C:/Users/32476/.chestnut/New folder/Untitled 2_pic/260703124755.png";
    expect(absolutePathToVaultRelative(abs, root)).toBe("Untitled 2_pic/260703124755.png");
  });
});

describe("resolveNoteImageVaultPath", () => {
  const notePath = "notes/sub/foo.md";

  it("resolves _pic paths relative to the note directory", () => {
    expect(resolveNoteImageVaultPath("foo_pic/image.png", notePath)).toBe(
      "notes/sub/foo_pic/image.png",
    );
  });

  it("keeps vault-relative paths that already include the note directory", () => {
    expect(resolveNoteImageVaultPath("notes/sub/foo_pic/image.png", notePath)).toBe(
      "notes/sub/foo_pic/image.png",
    );
  });

  it("resolves bare filenames relative to the note directory", () => {
    expect(resolveNoteImageVaultPath("image.png", notePath)).toBe("notes/sub/image.png");
  });

  it("resolves ./ relative paths against the note directory", () => {
    expect(resolveNoteImageVaultPath("./image.png", notePath)).toBe("notes/sub/image.png");
    expect(resolveNoteImageVaultPath("./image.png", "target/MyNote/MyNote.md")).toBe(
      "target/MyNote/image.png",
    );
  });
});

describe("extractMarkdownImageRefs", () => {
  it("extracts plain and angle-bracket image paths", () => {
    const md = [
      "![a](foo_pic/a.png)",
      '![b](<C:/vault/note_pic/spaced name.png>)',
      '![c](bar.png "caption")',
    ].join("\n");
    expect(extractMarkdownImageRefs(md)).toEqual([
      "foo_pic/a.png",
      "C:/vault/note_pic/spaced name.png",
      "bar.png",
    ]);
  });

  it("extracts windows paths that include chinese segments", () => {
    expect(
      extractMarkdownImageRefs("![x](C:/projects/测试/chestnut-hd-green.png)"),
    ).toEqual(["C:/projects/测试/chestnut-hd-green.png"]);
    expect(
      extractMarkdownImageRefs("![x](<C:/projects/测试/spaced 图.png>)"),
    ).toEqual(["C:/projects/测试/spaced 图.png"]);
  });
});

describe("isSingleMarkdownImageLine", () => {
  it("detects remote image markdown lines", () => {
    expect(
      isSingleMarkdownImageLine(
        '![网络测试图](https://picsum.photos/seed/boke-test/400/300 "这是图片描述")',
      ),
    ).toBe(true);
  });

  it("rejects plain text", () => {
    expect(isSingleMarkdownImageLine("hello world")).toBe(false);
  });
});

describe("markdownReferencesImage", () => {
  const notePath = "notes/foo.md";
  const vaultPath = "notes/foo_pic/image.png";
  const root = "C:/vault";

  it("detects references in markdown", () => {
    expect(markdownReferencesImage("![x](foo_pic/image.png)", vaultPath, notePath)).toBe(true);
    expect(markdownReferencesImage("![x](foo_pic/other.png)", vaultPath, notePath)).toBe(false);
  });

  it("detects absolute paths under vault root", () => {
    const md = "![x](<C:/vault/notes/foo_pic/image.png>)";
    expect(markdownReferencesImage(md, vaultPath, notePath, root)).toBe(true);
  });
});

describe("parseCloudAttachmentVaultPath", () => {
  it("extracts vault path from cloud attachment urls", () => {
    const url = "https://cloud.example/attachments/default/notes/foo_pic/a.png?token=abc";
    expect(parseCloudAttachmentVaultPath(url)).toBe("notes/foo_pic/a.png");
  });

  it("returns null for non-attachment urls", () => {
    expect(parseCloudAttachmentVaultPath("https://cdn.example.com/a.png")).toBeNull();
  });
});

describe("resolveMarkdownImageExportSource", () => {
  it("resolves local _pic refs to vault paths", () => {
    expect(
      resolveMarkdownImageExportSource("foo_pic/image.png", "notes/foo.md"),
    ).toEqual({
      kind: "vault",
      vaultPath: "notes/foo_pic/image.png",
    });
  });

  it("resolves cloud attachment urls to vault paths", () => {
    const url = "https://cloud.example/attachments/default/notes/foo_pic/a.png?token=abc";
    expect(resolveMarkdownImageExportSource(url, "notes/foo.md")).toEqual({
      kind: "vault",
      vaultPath: "notes/foo_pic/a.png",
    });
  });

  it("treats generic remote urls as remote downloads", () => {
    const url = "https://cdn.example.com/photo.jpg";
    expect(resolveMarkdownImageExportSource(url, "notes/foo.md")).toEqual({
      kind: "remote",
      url,
      suggestedFileName: "photo.jpg",
    });
  });

  it("treats absolute paths outside the vault as external files", () => {
    expect(
      resolveMarkdownImageExportSource(
        "C:/projects/测试/chestnut-hd-green.png",
        "notes/foo.md",
        "C:/Users/me/.chestnut",
      ),
    ).toEqual({
      kind: "external",
      absPath: "C:/projects/测试/chestnut-hd-green.png",
      suggestedFileName: "chestnut-hd-green.png",
    });
  });
});

describe("isExternalLocalImageRef", () => {
  const notePath = "notes/foo.md";
  const root = "C:/vault";

  it("detects absolute paths outside the vault", () => {
    expect(isExternalLocalImageRef("C:/projects/测试/chestnut-hd-green.png", notePath, root)).toBe(
      true,
    );
  });

  it("does not ingest managed _pic paths", () => {
    expect(isExternalLocalImageRef("foo_pic/image.png", notePath, root)).toBe(false);
    expect(
      isExternalLocalImageRef("<C:/vault/notes/foo_pic/image.png>", notePath, root),
    ).toBe(false);
  });
});

describe("collectNoteImageIngestTargets", () => {
  it("collects external local images and skips network urls when keeping them", () => {
    const md = [
      "![a](C:/projects/测试/a.png)",
      "![b](https://cdn.example.com/b.png)",
      "![c](foo_pic/c.png)",
    ].join("\n");
    expect(collectNoteImageIngestTargets(md, "notes/foo.md", "C:/vault", true)).toEqual([
      {
        kind: "external-local",
        ref: "C:/projects/测试/a.png",
        absPath: "C:/projects/测试/a.png",
      },
    ]);
  });

  it("collects network urls when not keeping them", () => {
    const md = "![b](https://cdn.example.com/b.png)";
    expect(collectNoteImageIngestTargets(md, "notes/foo.md", "C:/vault", false)).toEqual([
      { kind: "remote", ref: "https://cdn.example.com/b.png", url: "https://cdn.example.com/b.png" },
    ]);
  });
});

describe("applyMarkdownImageRefRewrites", () => {
  it("rewrites chinese external paths to the note _pic folder", () => {
    const next = applyMarkdownImageRefRewrites(
      "![x](C:/projects/测试/chestnut-hd-green.png)",
      new Map([["C:/projects/测试/chestnut-hd-green.png", "foo_pic/chestnut-hd-green.png"]]),
    );
    expect(next).toBe("![x](foo_pic/chestnut-hd-green.png)");
  });
});
