import { describe, expect, it } from "vitest";
import {
  isUpdateSessionResumable,
  isUpdateWorkInProgress,
  resolveUpdateToolbarClick,
  shouldKeepUpdateSessionOnEscape,
  shouldResumeUpdateDialog,
} from "./update-check-session.js";

describe("update-check session", () => {
  it("treats download as in-progress work", () => {
    expect(isUpdateWorkInProgress({ kind: "downloading", channel: "pre-release", version: "0.9.5", url: "https://example", installer: { fileName: "Chestnut_0.9.5_x64-setup.exe", url: "https://example/a.exe", size: 10 } })).toBe(true);
    expect(isUpdateWorkInProgress({ kind: "failed" })).toBe(false);
  });

  it("resumes a hidden download or failed session", () => {
    expect(
      shouldResumeUpdateDialog({
        open: false,
        sessionActive: true,
        outcome: { kind: "failed" },
      }),
    ).toBe(true);
    expect(
      shouldResumeUpdateDialog({
        open: false,
        sessionActive: true,
        outcome: {
          kind: "downloading",
          channel: "pre-release",
          version: "0.9.5",
          url: "https://example",
          installer: { fileName: "Chestnut_0.9.5_x64-setup.exe", url: "https://example/a.exe", size: 10 },
        },
      }),
    ).toBe(true);
    expect(
      shouldResumeUpdateDialog({
        open: false,
        sessionActive: false,
        outcome: { kind: "checking" },
      }),
    ).toBe(false);
    expect(
      shouldResumeUpdateDialog({
        open: false,
        sessionActive: true,
        outcome: { kind: "up-to-date", channel: "pre-release", version: "0.9.4" },
      }),
    ).toBe(false);
  });

  it("keeps the session on Esc while downloading or after failure", () => {
    expect(shouldKeepUpdateSessionOnEscape({ kind: "downloading", channel: "", version: "1", url: "", installer: { fileName: "a.exe", url: "https://x/a.exe", size: 1 } })).toBe(true);
    expect(shouldKeepUpdateSessionOnEscape({ kind: "failed" })).toBe(true);
    expect(shouldKeepUpdateSessionOnEscape({ kind: "opened", channel: "", version: "1" })).toBe(false);
    expect(isUpdateSessionResumable({ kind: "none" })).toBe(false);
  });

  it("resolves toolbar clicks: show hidden progress, then retry after a visible failure", () => {
    expect(
      resolveUpdateToolbarClick({
        open: false,
        sessionActive: true,
        outcome: { kind: "failed" },
      }),
    ).toBe("show");
    expect(
      resolveUpdateToolbarClick({
        open: true,
        sessionActive: true,
        outcome: { kind: "failed" },
      }),
    ).toBe("retry-check");
    expect(
      resolveUpdateToolbarClick({
        open: true,
        sessionActive: true,
        outcome: {
          kind: "downloading",
          channel: "",
          version: "1",
          url: "",
          installer: { fileName: "a.exe", url: "https://x/a.exe", size: 1 },
        },
      }),
    ).toBe("ignore");
    expect(
      resolveUpdateToolbarClick({
        open: false,
        sessionActive: false,
        outcome: { kind: "checking" },
      }),
    ).toBe("start-check");
    expect(
      resolveUpdateToolbarClick({
        open: true,
        sessionActive: true,
        outcome: {
          kind: "download-failed",
          channel: "pre-release",
          version: "0.9.5",
          url: "https://example",
          installer: { fileName: "a.exe", url: "https://example/a.exe", size: 1 },
        },
      }),
    ).toBe("retry-download");
  });
});
