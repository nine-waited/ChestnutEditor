import { describe, expect, it } from "vitest";
import {
  compareAppVersions,
  evaluateGithubUpdate,
  formatInstallerDownloadProgress,
  githubInstallerDownloadUrls,
  isChestnutWindowsInstallerName,
  isGithubInstallerDownloadUrl,
  pickGithubUpdateTarget,
  pickWindowsInstallerAsset,
} from "./app-update.js";

describe("compareAppVersions", () => {
  it("treats v-prefix as the same version", () => {
    expect(compareAppVersions("0.9.0", "v0.9.0")).toBe(0);
  });

  it("orders by semver fields", () => {
    expect(compareAppVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareAppVersions("0.9.1", "0.9.0")).toBe(1);
  });
});

describe("pickGithubUpdateTarget", () => {
  it("uses the latest published stable release when one exists", () => {
    const target = pickGithubUpdateTarget([
      {
        tag_name: "v0.10.0-beta",
        prerelease: true,
        draft: false,
        html_url: "https://github.com/nine-waited/ChestnutEditor/releases/tag/v0.10.0-beta",
        published_at: "2026-09-03T00:00:00Z",
      },
      {
        tag_name: "v0.9.0",
        prerelease: false,
        draft: false,
        html_url: "https://github.com/nine-waited/ChestnutEditor/releases/tag/v0.9.0",
        published_at: "2026-09-01T00:00:00Z",
      },
    ]);
    expect(target?.channel).toBe("release");
    expect(target?.version).toBe("0.9.0");
  });

  it("falls back to the newest pre-release when there is no stable release", () => {
    const target = pickGithubUpdateTarget([
      {
        tag_name: "v0.8.0",
        prerelease: true,
        draft: false,
        published_at: "2026-08-01T00:00:00Z",
      },
      {
        tag_name: "v0.9.0",
        prerelease: true,
        draft: false,
        published_at: "2026-08-30T00:00:00Z",
      },
      {
        tag_name: "v0.9.1",
        prerelease: true,
        draft: true,
        published_at: "2026-09-02T00:00:00Z",
      },
    ]);
    expect(target?.channel).toBe("prerelease");
    expect(target?.version).toBe("0.9.0");
  });
});

describe("Windows installer assets", () => {
  const installerUrl =
    "https://github.com/nine-waited/ChestnutEditor/releases/download/v0.9.1/Chestnut_0.9.1_x64-setup.exe";

  it("accepts the NSIS setup name and GitHub download URL", () => {
    expect(isChestnutWindowsInstallerName("Chestnut_0.9.1_x64-setup.exe")).toBe(true);
    expect(isGithubInstallerDownloadUrl(installerUrl)).toBe(true);
  });

  it("rejects path traversal and non-installer assets", () => {
    expect(isChestnutWindowsInstallerName("../Chestnut_0.9.1_x64-setup.exe")).toBe(false);
    expect(isChestnutWindowsInstallerName("notes.zip")).toBe(false);
    expect(
      isGithubInstallerDownloadUrl(
        "https://evil.example/Chestnut_0.9.1_x64-setup.exe",
      ),
    ).toBe(false);
  });

  it("prefers Chestnut_{version}_x64-setup.exe and adds a gh-proxy mirror", () => {
    const picked = pickWindowsInstallerAsset(
      [
        {
          name: "Chestnut_0.8.0_x64-setup.exe",
          browser_download_url:
            "https://github.com/nine-waited/ChestnutEditor/releases/download/v0.8.0/Chestnut_0.8.0_x64-setup.exe",
          size: 1,
        },
        {
          name: "Chestnut_0.9.1_x64-setup.exe",
          browser_download_url: installerUrl,
          size: 6_565_286,
        },
      ],
      "v0.9.1",
    );
    expect(picked).toEqual({
      fileName: "Chestnut_0.9.1_x64-setup.exe",
      url: installerUrl,
      size: 6_565_286,
    });
    expect(githubInstallerDownloadUrls(installerUrl)).toEqual([
      installerUrl,
      `https://gh-proxy.com/${installerUrl}`,
    ]);
  });

  it("formats download progress in megabytes", () => {
    expect(formatInstallerDownloadProgress(3_200_000, 6_565_286)).toBe("3.1M / 6M");
  });
});

describe("evaluateGithubUpdate", () => {
  it("reports up to date when current matches the target tag", () => {
    const result = evaluateGithubUpdate("0.9.0", [
      { tag_name: "v0.9.0", prerelease: true, draft: false, published_at: "2026-08-30T00:00:00Z" },
    ]);
    expect(result.status).toBe("up-to-date");
  });

  it("reports an update when the target is newer", () => {
    const result = evaluateGithubUpdate("0.9.0", [
      {
        tag_name: "v0.9.1",
        prerelease: false,
        draft: false,
        published_at: "2026-09-02T00:00:00Z",
        assets: [
          {
            name: "Chestnut_0.9.1_x64-setup.exe",
            browser_download_url:
              "https://github.com/nine-waited/ChestnutEditor/releases/download/v0.9.1/Chestnut_0.9.1_x64-setup.exe",
            size: 6_565_286,
          },
        ],
      },
    ]);
    expect(result.status).toBe("update-available");
    if (result.status === "update-available") {
      expect(result.target.version).toBe("0.9.1");
      expect(result.target.installer?.fileName).toBe("Chestnut_0.9.1_x64-setup.exe");
    }
  });
});
