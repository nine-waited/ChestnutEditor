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
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Edge = (typeof EDGES)[number];

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
  if (wasDrag) return;

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

if (img.complete && img.naturalWidth > 0) {
  void fitWindowToAspect();
} else {
  img.addEventListener("load", () => {
    void fitWindowToAspect();
  });
}
