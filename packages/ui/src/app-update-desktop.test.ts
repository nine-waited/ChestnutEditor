import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCatalogInWebview } from "./app-update-desktop.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchCatalogInWebview", () => {
  it("returns the first valid catalog without credentials or a forged referrer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("cdn.jsdelivr.net")) {
        return new Response('[{"tag_name":"v0.9.4"}]', { status: 200 });
      }
      return new Response("unavailable", { status: 503 });
    });

    await expect(fetchCatalogInWebview()).resolves.toContain('"tag_name":"v0.9.4"');
    expect(fetchMock).toHaveBeenCalled();
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.credentials).toBe("omit");
      expect(init?.referrerPolicy).toBe("no-referrer");
      expect(init?.headers).toBeUndefined();
    }
  });

  it("returns null when every mirror fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(fetchCatalogInWebview()).resolves.toBeNull();
  });
});
