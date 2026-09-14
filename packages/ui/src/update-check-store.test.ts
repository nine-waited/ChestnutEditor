import { afterEach, describe, expect, it } from "vitest";
import { useUpdateCheckStore } from "./update-check-store.js";

const installer = {
  fileName: "Chestnut_0.9.5_x64-setup.exe",
  url: "https://example/a.exe",
  size: 1000,
};

afterEach(() => {
  useUpdateCheckStore.getState().dismiss();
});

describe("update-check store", () => {
  it("hides a download without resetting progress", () => {
    const store = useUpdateCheckStore.getState();
    store.start();
    store.beginDownload({
      kind: "update-available",
      channel: "pre-release",
      version: "0.9.5",
      url: "https://example",
      installer,
    });
    store.setDownloadBytes(400, 1000);
    store.hide();

    const hidden = useUpdateCheckStore.getState();
    expect(hidden.open).toBe(false);
    expect(hidden.sessionActive).toBe(true);
    expect(hidden.outcome.kind).toBe("downloading");
    expect(hidden.received).toBe(400);
    expect(Math.round(hidden.progress)).toBe(40);

    hidden.show();
    expect(useUpdateCheckStore.getState().open).toBe(true);
    expect(useUpdateCheckStore.getState().received).toBe(400);
  });

  it("keeps a hidden failure so the dialog can show it later", () => {
    const store = useUpdateCheckStore.getState();
    store.start();
    store.hide();
    store.finish({ kind: "failed" });

    const hidden = useUpdateCheckStore.getState();
    expect(hidden.open).toBe(false);
    expect(hidden.sessionActive).toBe(true);
    expect(hidden.outcome.kind).toBe("failed");
  });

  it("does not reopen after a background download succeeds", () => {
    const store = useUpdateCheckStore.getState();
    store.start();
    store.beginDownload({
      kind: "update-available",
      channel: "pre-release",
      version: "0.9.5",
      url: "https://example",
      installer,
    });
    store.hide();
    store.finish({ kind: "opened", channel: "pre-release", version: "0.9.5" });

    const done = useUpdateCheckStore.getState();
    expect(done.open).toBe(false);
    expect(done.sessionActive).toBe(false);
    expect(done.outcome.kind).toBe("opened");
  });
});
