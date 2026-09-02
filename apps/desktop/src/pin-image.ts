import { invoke } from "@tauri-apps/api/core";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

const id = new URLSearchParams(window.location.search).get("id");
if (!id) {
  throw new Error("missing pin id");
}

const payload = await invoke<{ src: string; alt: string }>("take_pin_image_payload", { id });
const win = getCurrentWindow();

const MIN_EDGE = 80;
const MAX_EDGE = 3600;
const ZOOM_SENSITIVITY = 0.00105;
const ZOOM_LERP = 0.28;
const ZOOM_COMMIT_PX = 2;
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Edge = (typeof EDGES)[number];

let liveWidth = 0;
let liveHeight = 0;
let liveX = 0;
let liveY = 0;
let liveReady = false;
let selfUpdating = 0;
let syncGen = 0;
let actualWidth = 0;
let actualHeight = 0;
let actualX = 0;
let actualY = 0;
let targetWidth = 0;
let targetHeight = 0;
let targetX = 0;
let targetY = 0;
let displayWidth = 0;
let displayHeight = 0;
let displayX = 0;
let displayY = 0;
let zooming = false;
let zoomRaf = 0;

const shell = document.createElement("div");
shell.className = "pin-shell";

const closeBtn = document.createElement("button");
closeBtn.type = "button";
closeBtn.className = "pin-close";
closeBtn.title = "关闭";
closeBtn.setAttribute("aria-label", "关闭");
closeBtn.textContent = "×";

const img = document.createElement("img");
img.src = payload.src;
img.alt = payload.alt;
img.draggable = false;

shell.append(closeBtn, img);
for (const edge of EDGES) {
  const handle = document.createElement("div");
  handle.className = `pin-handle pin-handle--${edge}`;
  handle.dataset.edge = edge;
  handle.setAttribute("aria-hidden", "true");
  shell.append(handle);
}
document.body.append(shell);

const menu = document.createElement("div");
menu.className = "pin-menu";
menu.hidden = true;
menu.setAttribute("role", "menu");

const deleteItem = document.createElement("button");
deleteItem.type = "button";
deleteItem.className = "pin-menu__item";
deleteItem.setAttribute("role", "menuitem");
deleteItem.textContent = "删除";
menu.append(deleteItem);
document.body.append(menu);

/**
 * Do not call startDragging() on the first click — it steals OS mouse capture and
 * prevents a reliable double-click close. Only drag after the pointer moves.
 */
const DRAG_THRESHOLD_PX = 6;
const DOUBLE_CLICK_MS = 450;

let pointerActive = false;
let dragStarted = false;
let downX = 0;
let downY = 0;
let lastTapAt = 0;

const isResizeHandle = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.classList.contains("pin-handle");

const hideMenu = () => {
  menu.hidden = true;
};

const closeWindow = () => {
  hideMenu();
  void win.close();
};

const showMenu = (x: number, y: number) => {
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - pad);
  const top = Math.min(y, window.innerHeight - rect.height - pad);
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;
};

const imageAspect = () => {
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    return img.naturalWidth / img.naturalHeight;
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  return h > 0 ? w / h : 1;
};

const fitWindowToAspect = async () => {
  const aspect = imageAspect();
  const size = await win.innerSize();
  const width = Math.max(MIN_EDGE, size.width);
  const height = Math.max(MIN_EDGE, Math.round(width / aspect));
  if (Math.abs(height - size.height) > 1) {
    await win.setSize(new PhysicalSize(width, height));
  }
  await syncLiveFromWindow();
};

const adoptRect = (width: number, height: number, x: number, y: number) => {
  liveWidth = actualWidth = targetWidth = displayWidth = width;
  liveHeight = actualHeight = targetHeight = displayHeight = height;
  liveX = actualX = targetX = displayX = x;
  liveY = actualY = targetY = displayY = y;
  liveReady = true;
};

const syncLiveFromWindow = async () => {
  const gen = ++syncGen;
  const [size, pos] = await Promise.all([win.innerSize(), win.outerPosition()]);
  if (gen !== syncGen || selfUpdating || zooming) return;
  adoptRect(size.width, size.height, pos.x, pos.y);
};

void win.onMoved(({ payload }) => {
  actualX = payload.x;
  actualY = payload.y;
  if (selfUpdating || zooming) return;
  syncGen += 1;
  liveX = targetX = displayX = payload.x;
  liveY = targetY = displayY = payload.y;
  liveReady = true;
});

void win.onResized(({ payload }) => {
  actualWidth = payload.width;
  actualHeight = payload.height;
  if (selfUpdating || zooming) return;
  liveWidth = targetWidth = displayWidth = payload.width;
  liveHeight = targetHeight = displayHeight = payload.height;
  liveReady = true;
});

const clampAspectSize = (width: number, aspect: number) => {
  let nextWidth = width;
  let nextHeight = nextWidth / aspect;
  if (nextWidth < MIN_EDGE) {
    nextWidth = MIN_EDGE;
    nextHeight = nextWidth / aspect;
  }
  if (nextHeight < MIN_EDGE) {
    nextHeight = MIN_EDGE;
    nextWidth = nextHeight * aspect;
  }
  if (nextWidth > MAX_EDGE) {
    nextWidth = MAX_EDGE;
    nextHeight = nextWidth / aspect;
  }
  if (nextHeight > MAX_EDGE) {
    nextHeight = MAX_EDGE;
    nextWidth = nextHeight * aspect;
  }
  return { width: nextWidth, height: nextHeight };
};

const clearZoomTransform = () => {
  shell.style.transform = "";
};

const applyZoomTransform = () => {
  const base = Math.max(1, actualWidth);
  const scale = displayWidth / base;
  if (Math.abs(scale - 1) < 0.001) {
    clearZoomTransform();
    return;
  }
  shell.style.transformOrigin = "0 0";
  shell.style.transform = `scale(${scale})`;
};

const commitZoomWindow = (width: number, height: number) => {
  if (selfUpdating) return;
  selfUpdating += 1;
  liveWidth = width;
  liveHeight = height;
  void win.setSize(new PhysicalSize(width, height)).finally(() => {
    selfUpdating = Math.max(0, selfUpdating - 1);
  });
};

const stopZoomAnimation = () => {
  if (zoomRaf) {
    cancelAnimationFrame(zoomRaf);
    zoomRaf = 0;
  }
  zooming = false;
  clearZoomTransform();
};

const almostEqual = (a: number, b: number, epsilon = 0.6) => Math.abs(a - b) < epsilon;

const tickZoom = () => {
  zoomRaf = 0;
  displayWidth += (targetWidth - displayWidth) * ZOOM_LERP;
  displayHeight += (targetHeight - displayHeight) * ZOOM_LERP;

  const settled =
    almostEqual(displayWidth, targetWidth) && almostEqual(displayHeight, targetHeight);

  if (settled) {
    displayWidth = targetWidth;
    displayHeight = targetHeight;
  }

  applyZoomTransform();

  const width = Math.round(displayWidth);
  const height = Math.round(displayHeight);
  const drifted =
    Math.abs(width - Math.round(actualWidth)) >= ZOOM_COMMIT_PX ||
    Math.abs(height - Math.round(actualHeight)) >= ZOOM_COMMIT_PX;

  if (settled) {
    if (drifted) commitZoomWindow(width, height);
    if (selfUpdating) {
      zoomRaf = requestAnimationFrame(tickZoom);
      return;
    }
    clearZoomTransform();
    zooming = false;
    adoptRect(width, height, actualX, actualY);
    return;
  }

  if (drifted) commitZoomWindow(width, height);
  zoomRaf = requestAnimationFrame(tickZoom);
};

const startZoomAnimation = () => {
  zooming = true;
  if (!zoomRaf) zoomRaf = requestAnimationFrame(tickZoom);
};

const wheelPixels = (event: WheelEvent) => {
  const raw = event.deltaY !== 0 ? event.deltaY : event.deltaX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return raw * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return raw * 400;
  return raw;
};

const zoomPinByWheel = (delta: number) => {
  if (!liveReady) return;
  if (!zooming) {
    const width = actualWidth > 1 ? actualWidth : liveWidth;
    const height = actualHeight > 1 ? actualHeight : liveHeight;
    adoptRect(width, height, actualX, actualY);
  }
  const aspect = imageAspect();
  const factor = Math.min(1.14, Math.max(0.88, Math.exp(-delta * ZOOM_SENSITIVITY)));
  const next = clampAspectSize(targetWidth * factor, aspect);
  if (almostEqual(next.width, targetWidth, 0.05) && almostEqual(next.height, targetHeight, 0.05)) return;
  targetWidth = next.width;
  targetHeight = next.height;
  startZoomAnimation();
};

const sizedFromAspect = (
  edge: Edge,
  dx: number,
  dy: number,
  startW: number,
  startH: number,
  startX: number,
  startY: number,
  aspect: number,
) => {
  const fromEast = edge.includes("e");
  const fromWest = edge.includes("w");
  const fromSouth = edge.includes("s");
  const fromNorth = edge.includes("n");
  const isCorner = (fromEast || fromWest) && (fromNorth || fromSouth);

  let width = startW;
  let height = startH;

  if (isCorner) {
    const rawW = fromEast ? startW + dx : startW - dx;
    const rawH = fromSouth ? startH + dy : startH - dy;
    const scale =
      Math.abs(rawW / startW - 1) >= Math.abs(rawH / startH - 1) ? rawW / startW : rawH / startH;
    width = startW * scale;
    height = width / aspect;
  } else if (fromEast || fromWest) {
    width = fromEast ? startW + dx : startW - dx;
    height = width / aspect;
  } else {
    height = fromSouth ? startH + dy : startH - dy;
    width = height * aspect;
  }

  width = Math.max(MIN_EDGE, width);
  height = width / aspect;
  if (height < MIN_EDGE) {
    height = MIN_EDGE;
    width = height * aspect;
  }

  width = Math.round(width);
  height = Math.round(width / aspect);

  const x = fromWest ? startX + (startW - width) : startX;
  const y = fromNorth ? startY + (startH - height) : startY;
  return { width, height, x, y };
};

const startBorderResize = (event: PointerEvent, edge: Edge) => {
  event.preventDefault();
  event.stopPropagation();
  pointerActive = false;
  dragStarted = false;
  lastTapAt = 0;
  stopZoomAnimation();

  const handle = event.currentTarget;
  if (handle instanceof HTMLElement) {
    handle.setPointerCapture(event.pointerId);
  }

  const originX = event.screenX;
  const originY = event.screenY;

  void Promise.all([win.innerSize(), win.outerPosition()]).then(([startSize, startPos]) => {
    const aspect = imageAspect();
    const onMove = (moveEvent: PointerEvent) => {
      const next = sizedFromAspect(
        edge,
        moveEvent.screenX - originX,
        moveEvent.screenY - originY,
        startSize.width,
        startSize.height,
        startPos.x,
        startPos.y,
        aspect,
      );
      void win.setSize(new PhysicalSize(next.width, next.height));
      if (next.x !== startPos.x || next.y !== startPos.y) {
        void win.setPosition(new PhysicalPosition(next.x, next.y));
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      stopZoomAnimation();
      void syncLiveFromWindow();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
};

closeBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
});
closeBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  closeWindow();
});

deleteItem.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  closeWindow();
});

shell.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  pointerActive = false;
  dragStarted = false;
  lastTapAt = 0;
  showMenu(event.clientX, event.clientY);
});

document.addEventListener("pointerdown", (event) => {
  if (menu.hidden) return;
  const target = event.target;
  if (target instanceof Node && menu.contains(target)) return;
  hideMenu();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!menu.hidden) {
      hideMenu();
      return;
    }
    closeWindow();
  }
});

window.addEventListener("blur", hideMenu);
window.addEventListener("resize", hideMenu);

shell.addEventListener("pointerenter", () => {
  void win.setFocus();
  if (!selfUpdating && !zooming) void syncLiveFromWindow();
});

shell.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target === closeBtn || isResizeHandle(event.target)) return;
  if (!menu.hidden) hideMenu();

  pointerActive = true;
  dragStarted = false;
  downX = event.clientX;
  downY = event.clientY;
});

shell.addEventListener("pointermove", (event) => {
  if (!pointerActive || dragStarted) return;
  const dx = event.clientX - downX;
  const dy = event.clientY - downY;
  if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
  dragStarted = true;
  lastTapAt = 0;
  stopZoomAnimation();
  void win.startDragging();
});

shell.addEventListener("pointerup", (event) => {
  if (event.button !== 0) return;
  if (event.target === closeBtn || isResizeHandle(event.target)) {
    pointerActive = false;
    return;
  }

  const wasDrag = dragStarted;
  pointerActive = false;
  dragStarted = false;
  if (wasDrag) {
    // OS dragging steals the pointer; position is tracked via onMoved.
    return;
  }

  const now = Date.now();
  if (now - lastTapAt <= DOUBLE_CLICK_MS) {
    lastTapAt = 0;
    closeWindow();
    return;
  }
  lastTapAt = now;
});

shell.addEventListener("pointercancel", () => {
  pointerActive = false;
  dragStarted = false;
});

Array.from(shell.querySelectorAll<HTMLElement>(".pin-handle")).forEach((handle) => {
  const edge = handle.dataset.edge as Edge | undefined;
  if (!edge) return;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    startBorderResize(event, edge);
  });
});

window.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    hideMenu();
    const delta = wheelPixels(event);
    if (delta === 0) return;
    if (!liveReady) {
      void syncLiveFromWindow().then(() => zoomPinByWheel(delta));
      return;
    }
    zoomPinByWheel(delta);
  },
  { passive: false },
);

if (img.complete && img.naturalWidth > 0) {
  void fitWindowToAspect();
} else {
  img.addEventListener("load", () => {
    void fitWindowToAspect();
  });
}
