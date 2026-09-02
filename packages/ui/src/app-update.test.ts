import { describe, expect, it } from "vitest";
import {
  compareAppVersions,
  evaluateGithubUpdate,
  pickGithubUpdateTarget,
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

describe("evaluateGithubUpdate", () => {
  it("reports up to date when current matches the target tag", () => {
    const result = evaluateGithubUpdate("0.9.0", [
      { tag_name: "v0.9.0", prerelease: true, draft: false, published_at: "2026-08-30T00:00:00Z" },
    ]);
    expect(result.status).toBe("up-to-date");
  });

  it("reports an update when the target is newer", () => {
    const result = evaluateGithubUpdate("0.9.0", [
      { tag_name: "v0.9.1", prerelease: false, draft: false, published_at: "2026-09-02T00:00:00Z" },
    ]);
    expect(result.status).toBe("update-available");
    if (result.status === "update-available") {
      expect(result.target.version).toBe("0.9.1");
    }
  });
});
