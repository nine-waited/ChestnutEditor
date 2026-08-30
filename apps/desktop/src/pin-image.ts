import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

const id = new URLSearchParams(window.location.search).get("id");
if (!id) {
  throw new Error("missing pin id");
}

const payload = await invoke<{ src: string; alt: string }>("take_pin_image_payload", { id });
const win = getCurrentWindow();

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

const resize = document.createElement("div");
resize.className = "pin-resize";
resize.setAttribute("aria-hidden", "true");

shell.append(closeBtn, img, resize);
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
  if (event.target === resize || event.target === closeBtn) return;
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
  if (event.target === resize || event.target === closeBtn) {
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

resize.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  pointerActive = false;

  const startX = event.screenX;
  const startY = event.screenY;

  void win.innerSize().then((startSize) => {
    const onMove = (moveEvent: PointerEvent) => {
      const width = Math.max(120, startSize.width + (moveEvent.screenX - startX));
      const height = Math.max(80, startSize.height + (moveEvent.screenY - startY));
      void win.setSize(new LogicalSize(width, height));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
});
