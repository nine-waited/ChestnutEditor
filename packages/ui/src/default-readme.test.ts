import { describe, expect, it } from "vitest";
import {
  MERMAID_DEMO_PATH,
  README_CN_PATH,
  README_EN_PATH,
  ensureDefaultReadme,
  resolveDefaultNotesSeededVaults,
  vaultDefaultNotesSeedKey,
} from "./default-readme.js";

describe("vaultDefaultNotesSeedKey", () => {
  it("normalizes slashes and trailing slash", () => {
    expect(vaultDefaultNotesSeedKey("C:\\Users\\me\\.chestnut\\")).toBe("c:/users/me/.chestnut");
  });
});

describe("resolveDefaultNotesSeededVaults", () => {
  it("is empty on a fresh install", () => {
    expect(resolveDefaultNotesSeededVaults({})).toEqual([]);
  });

  it("treats the previous vault as already seeded when the flag is missing", () => {
    expect(
      resolveDefaultNotesSeededVaults({ localVaultPath: "C:\\Users\\me\\.chestnut" }),
    ).toEqual(["c:/users/me/.chestnut"]);
  });

  it("uses the explicit seeded list when present", () => {
    expect(
      resolveDefaultNotesSeededVaults({
        localVaultPath: "C:/old",
        defaultNotesSeededVaults: ["C:/vault/a", "C:\\vault\\a"],
      }),
    ).toEqual(["c:/vault/a"]);
  });
});

describe("ensureDefaultReadme", () => {
  it("writes missing sample notes on first init", async () => {
    const written: string[] = [];
    const created = await ensureDefaultReadme(
      async () => false,
      async (path) => {
        written.push(path);
      },
    );
    expect(created).toBe(true);
    expect(written).toEqual([README_EN_PATH, README_CN_PATH, MERMAID_DEMO_PATH]);
  });

  it("does not recreate notes after the vault has already been seeded", async () => {
    const written: string[] = [];
    const created = await ensureDefaultReadme(
      async () => false,
      async (path) => {
        written.push(path);
      },
      true,
    );
    expect(created).toBe(false);
    expect(written).toEqual([]);
  });

  it("does not overwrite sample notes that already exist", async () => {
    const written: string[] = [];
    const created = await ensureDefaultReadme(
      async () => true,
      async (path) => {
        written.push(path);
      },
    );
    expect(created).toBe(false);
    expect(written).toEqual([]);
  });
});
