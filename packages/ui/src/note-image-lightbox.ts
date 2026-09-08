let lightbox: HTMLDivElement | null = null;
let onKeyDown: ((event: KeyboardEvent) => void) | null = null;

export function isNoteImageLightboxOpen(): boolean {
  return lightbox !== null;
}

export function closeNoteImageLightbox(): void {
  if (onKeyDown) {
    document.removeEventListener("keydown", onKeyDown);
    onKeyDown = null;
  }
  lightbox?.remove();
  lightbox = null;
}

export function openNoteImageLightbox(img: HTMLImageElement): void {
  closeNoteImageLightbox();

  const overlay = document.createElement("div");
  overlay.className = "chestnut-note-image-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const preview = document.createElement("img");
  preview.className = "chestnut-note-image-lightbox__img";
  preview.src = img.currentSrc || img.src;
  preview.alt = img.getAttribute("alt")?.trim() || "";
  preview.draggable = false;

  overlay.appendChild(preview);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeNoteImageLightbox();
  });
  preview.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeNoteImageLightbox();
    }
  };
  document.addEventListener("keydown", onKeyDown, true);

  document.body.appendChild(overlay);
  lightbox = overlay;
}
