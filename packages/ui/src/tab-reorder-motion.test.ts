import { describe, expect, it } from "vitest";
import {
  insertBeforeIdFromLayout,
  visualTabOrderKey,
  visualTabsForInsert,
  type TabStripLayoutItem,
} from "./tab-reorder-motion.js";

const layout: TabStripLayoutItem[] = [
  { id: "a", offset: 0, width: 80 },
  { id: "b", offset: 82, width: 80 },
  { id: "c", offset: 164, width: 80 },
];

describe("insertBeforeIdFromLayout", () => {
  it("inserts before the tab whose midpoint the pointer has not yet passed", () => {
    expect(insertBeforeIdFromLayout(30, layout, "b")).toBe("a");
    expect(insertBeforeIdFromLayout(90, layout, "b")).toBe("c");
  });

  it("returns null when the pointer is past the last other tab (move to end)", () => {
    expect(insertBeforeIdFromLayout(220, layout, "b")).toBeNull();
  });

  it("ignores the dragged tab's own slot", () => {
    expect(insertBeforeIdFromLayout(100, layout, "b")).toBe("c");
  });
});

describe("visualTabsForInsert", () => {
  const leaves = [
    { id: "a", path: "a.md" },
    { id: "b", path: "b.md" },
    { id: "c", path: "c.md" },
  ];

  it("inserts a drop slot before the target tab for an incoming file", () => {
    const items = visualTabsForInsert(
      leaves,
      { insertBeforeId: "b", incomingPath: "new.md" },
      null,
    );
    expect(visualTabOrderKey(items)).toBe("a\0__slot__\0b\0c");
  });

  it("appends a drop slot when inserting at the end", () => {
    const items = visualTabsForInsert(leaves, { insertBeforeId: null, incomingPath: "new.md" }, null);
    expect(visualTabOrderKey(items)).toBe("a\0b\0c\0__slot__");
  });

  it("hides the slot once the incoming file is already open", () => {
    const items = visualTabsForInsert(
      [...leaves, { id: "n", path: "new.md" }],
      { insertBeforeId: "b", incomingPath: "new.md" },
      null,
    );
    expect(items.every((item) => item.type === "leaf")).toBe(true);
  });

  it("hides the dragged tab and inserts a drop slot at the target", () => {
    const items = visualTabsForInsert(
      leaves,
      { insertBeforeId: "a", excludeLeafId: "c" },
      null,
    );
    expect(visualTabOrderKey(items)).toBe("__slot__\0a\0b");
  });

  it("uses draggingLeafId as the excluded tab when inserting a slot", () => {
    const items = visualTabsForInsert(leaves, { insertBeforeId: "c" }, "b");
    expect(visualTabOrderKey(items)).toBe("a\0__slot__\0c");
  });
});
