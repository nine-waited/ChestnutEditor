import { describe, expect, it } from "vitest";
import {
  formatStartupLogSnapshot,
  getStartupDebugUiSnapshot,
  openStartupDebugPanel,
  closeStartupDebugPanel,
  type StartupLogSnapshot,
} from "./startup-debug.js";

describe("formatStartupLogSnapshot", () => {
  it("prints a timed boot trail", () => {
    const snapshot: StartupLogSnapshot = {
      bootId: "1",
      startedAt: "2026-09-02T04:00:00.000Z",
      entries: [
        { ms: 0, at: "2026-09-02T04:00:00.000Z", step: "index.html: parsed", level: "info" },
        {
          ms: 1200,
          at: "2026-09-02T04:00:01.200Z",
          step: "mount: vaultService.mount",
          detail: "path=D:/notes",
          level: "info",
        },
      ],
    };
    const text = formatStartupLogSnapshot(snapshot);
    expect(text).toContain("bootId=1");
    expect(text).toContain("index.html: parsed");
    expect(text).toContain("path=D:/notes");
    expect(text).toContain("+  1200ms");
  });
});

describe("getStartupDebugUiSnapshot", () => {
  it("returns a cached object until the debug store notifies", () => {
    closeStartupDebugPanel();
    const first = getStartupDebugUiSnapshot();
    expect(getStartupDebugUiSnapshot()).toBe(first);
    openStartupDebugPanel();
    const opened = getStartupDebugUiSnapshot();
    expect(opened).not.toBe(first);
    expect(opened.open).toBe(true);
    expect(getStartupDebugUiSnapshot()).toBe(opened);
    closeStartupDebugPanel();
  });
});
