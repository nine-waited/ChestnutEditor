import { describe, expect, it } from "vitest";
import { isVaultRootSwitch } from "./vault-switch.js";

describe("isVaultRootSwitch", () => {
  it("detects a different tauri vault root", () => {
    const adapter = {
      kind: "tauri" as const,
      getRootPath: () => "C:/vault/b",
    };
    expect(isVaultRootSwitch(adapter as never, "C:/vault/a")).toBe(true);
    expect(isVaultRootSwitch(adapter as never, "C:\\vault\\b")).toBe(false);
  });
});
