import { describe, expect, it } from "vitest";
import {
  tableToolbarBox,
  tableToolbarHostIsLiveFromAncestors,
  tableToolbarShouldShow,
} from "./markdown-table-toolbar.js";

const clip = { left: 100, top: 80, right: 500, bottom: 400 };

describe("tableToolbarBox", () => {
  it("sits above the table when there is room inside the editor", () => {
    expect(
      tableToolbarBox({ left: 120, top: 160, right: 480, bottom: 300 }, clip, 32),
    ).toEqual({ left: 120, top: 128, width: 360 });
  });

  it("clamps to the editor top instead of overflowing the pane", () => {
    expect(
      tableToolbarBox({ left: 120, top: 90, right: 480, bottom: 300 }, clip, 32),
    ).toEqual({ left: 120, top: 80, width: 360 });
  });

  it("hides when the table has scrolled out of the editor", () => {
    expect(
      tableToolbarBox({ left: 120, top: -40, right: 480, bottom: 70 }, clip, 32),
    ).toBeNull();
    expect(
      tableToolbarBox({ left: 120, top: 420, right: 480, bottom: 520 }, clip, 32),
    ).toBeNull();
  });

  it("clips width to the editor", () => {
    expect(
      tableToolbarBox({ left: 40, top: 160, right: 560, bottom: 300 }, clip, 32),
    ).toEqual({ left: 100, top: 128, width: 400 });
  });
});

describe("tableToolbarShouldShow", () => {
  const host = {} as HTMLElement;

  it("shows only while the table is connected in a live host", () => {
    expect(
      tableToolbarShouldShow({
        editable: true,
        inTable: true,
        tableConnected: true,
        host,
        hostLive: true,
      }),
    ).toBe(true);
  });

  it("hides when the note pane is no longer active", () => {
    expect(
      tableToolbarShouldShow({
        editable: true,
        inTable: true,
        tableConnected: true,
        host,
        hostLive: false,
      }),
    ).toBe(false);
  });

  it("hides when the table is gone", () => {
    expect(
      tableToolbarShouldShow({
        editable: true,
        inTable: true,
        tableConnected: false,
        host,
        hostLive: true,
      }),
    ).toBe(false);
  });
});

describe("tableToolbarHostIsLiveFromAncestors", () => {
  it("follows the keep-alive pane and mode slots", () => {
    expect(
      tableToolbarHostIsLiveFromAncestors({
        connected: true,
        hiddenAncestor: false,
        paneSlotActive: true,
        modeSlotActive: true,
      }),
    ).toBe(true);
    expect(
      tableToolbarHostIsLiveFromAncestors({
        connected: true,
        hiddenAncestor: false,
        paneSlotActive: false,
        modeSlotActive: true,
      }),
    ).toBe(false);
    expect(
      tableToolbarHostIsLiveFromAncestors({
        connected: true,
        hiddenAncestor: true,
        paneSlotActive: true,
        modeSlotActive: true,
      }),
    ).toBe(false);
    expect(
      tableToolbarHostIsLiveFromAncestors({
        connected: true,
        hiddenAncestor: false,
        paneSlotActive: null,
        modeSlotActive: false,
      }),
    ).toBe(false);
  });
});
