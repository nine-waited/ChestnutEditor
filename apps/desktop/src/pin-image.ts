import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

const id = new URLSearchParams(window.location.search).get("id");
if (!id) {
  throw new Error("missing pin id");
}

const payload = await invoke<{ src: string; alt: string }>("take_pin_image_payload", { id });

const shell = document.createElement("div");
shell.className = "pin-shell";

const img = document.createElement("img");
img.src = payload.src;
img.alt = payload.alt;
img.draggable = false;

const resize = document.createElement("div");
resize.className = "pin-resize";
resize.setAttribute("aria-hidden", "true");

shell.append(img, resize);
document.body.append(shell);

shell.addEventListener("pointerdown", (event) => {
  if (event.target === resize) return;
  if (event.detail >= 2) return;
  void getCurrentWindow().startDragging();
});

shell.addEventListener("dblclick", (event) => {
  if (event.target === resize) return;
  event.preventDefault();
  void getCurrentWindow().close();
});

resize.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();

  const startX = event.screenX;
  const startY = event.screenY;
  const win = getCurrentWindow();

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
