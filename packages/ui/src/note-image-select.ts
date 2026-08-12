import { getT } from "./i18n/index.js";
import { confirmAction } from "./confirm-dialog.js";
import { NOTE_IMAGE_EDIT_ICON, NOTE_IMAGE_TRASH_ICON, NOTE_IMAGE_ZOOM_ICON } from "./note-image-toolbar-icons.js";
import { closeNoteImageLightbox, isNoteImageLightboxOpen, openNoteImageLightbox } from "./note-image-lightbox.js";
import { useAppStore } from "./store.js";

export interface NoteImageSelectOptions {
  /** View-only: hide toolbar, block delete; double-click still opens lightbox. */
  viewOnly?: boolean;
  getImageCaption: (img: HTMLImageElement) => string;
  onCopy: (img: HTMLImageElement) => void | Promise<void>;
  onDelete: (img: HTMLImageElement) => void | Promise<void>;
  onInsertLineBelow: (img: HTMLImageElement) => void;
  onUpdateCaption: (img: HTMLImageElement, caption: string) => void | Promise<void>;
}

const IMAGE_BLOCK_SELECTOR = [
  "[data-type=\"image-block\"]",
  "[data-node-type=\"image-block\"]",
  ".image-block",
  ".milkdown-image-block",
  ".crepe-image-block",
].join(", ");

export function resolveNoteImage(target: HTMLElement, container: HTMLElement): HTMLImageElement | null {
  if (target.closest(".boke-note-image-toolbar")) return null;
  if (target.closest(".boke-note-image-lightbox")) return null;

  const direct =
    target instanceof HTMLImageElement
      ? target
      : target.closest("img") instanceof HTMLImageElement
        ? (target.closest("img") as HTMLImageElement)
        : null;
  if (direct && container.contains(direct)) return direct;

  const shell = target.closest(IMAGE_BLOCK_SELECTOR);
  if (shell && container.contains(shell)) {
    const inner = shell.querySelector("img");
    if (inner instanceof HTMLImageElement) return inner;
  }

  return null;
}

export function attachNoteImageSelectHandlers(
  container: HTMLElement,
  options: NoteImageSelectOptions,
): () => void {
  let selected: HTMLImageElement | null = null;
  let toolbar: HTMLDivElement | null = null;
  let captionInput: HTMLInputElement | null = null;
  let captionDraft = "";

  const closeCaptionInput = (restoreDraft = false) => {
    if (restoreDraft && captionInput) captionInput.value = captionDraft;
    captionInput?.classList.remove("boke-note-image-toolbar__caption-input--open");
    toolbar?.classList.remove("boke-note-image-toolbar--caption-open");
  };

  const positionToolbar = (img: HTMLImageElement) => {
    if (!toolbar) return;
    const imgRect = img.getBoundingClientRect();
    const inset = 8;
    toolbar.style.position = "fixed";
    toolbar.style.top = `${imgRect.bottom + inset}px`;
    toolbar.style.left = `${imgRect.right}px`;
    toolbar.style.right = "auto";
    toolbar.style.transform = "translateX(-100%)";
  };

  const clearSelection = () => {
    closeCaptionInput();
    selected?.classList.remove("boke-note-image--selected");
    selected?.closest(IMAGE_BLOCK_SELECTOR)?.classList.remove("boke-note-image-block--selected");
    selected = null;
    toolbar?.remove();
    toolbar = null;
    captionInput = null;
  };

  const commitCaption = async () => {
    if (!selected || !captionInput) return;
    const img = selected;
    const caption = captionInput.value.trim();
    closeCaptionInput();
    captionInput.value = "";
    await options.onUpdateCaption(img, caption);
    clearSelection();
  };

  const openCaptionInput = (img: HTMLImageElement) => {
    if (!toolbar || !captionInput) return;
    captionDraft = options.getImageCaption(img);
    captionInput.value = captionDraft;
    toolbar.classList.add("boke-note-image-toolbar--caption-open");
    captionInput.classList.add("boke-note-image-toolbar__caption-input--open");
    captionInput.focus();
    captionInput.select();
  };

  const requestDelete = async () => {
    if (options.viewOnly || !selected) return;
    const img = selected;
    const t = getT();
    const name = img.getAttribute("alt")?.trim() || img.dataset.vaultPath?.split("/").pop() || "image";
    const deleteFileHint = useAppStore.getState().deleteImageFilesOnRemove
      ? `\n${t("note.deleteImageConfirmFileHint")}`
      : "";
    const confirmed = await confirmAction({
      title: t("note.deleteImageTitle"),
      message: `${t("note.deleteImageConfirm", { name })}${deleteFileHint}`,
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    clearSelection();
    await options.onDelete(img);
  };

  const selectImage = (img: HTMLImageElement) => {
    if (options.viewOnly) return;
    if (selected === img) return;
    clearSelection();
    selected = img;
    img.classList.add("boke-note-image--selected");
    img.closest(IMAGE_BLOCK_SELECTOR)?.classList.add("boke-note-image-block--selected");

    const t = getT();
    toolbar = document.createElement("div");
    toolbar.className = "boke-note-image-toolbar";
    toolbar.innerHTML = `
      <input
        type="text"
        class="boke-note-image-toolbar__caption-input"
        placeholder="${t("note.imageCaptionPlaceholder")}"
        aria-label="${t("note.editImageCaption")}"
      />
      <button type="button" class="boke-note-image-toolbar__btn boke-note-image-toolbar__edit" title="${t("note.editImageCaption")}" aria-label="${t("note.editImageCaption")}">
        ${NOTE_IMAGE_EDIT_ICON}
      </button>
      <button type="button" class="boke-note-image-toolbar__btn boke-note-image-toolbar__zoom" title="${t("note.zoomImageAction")}" aria-label="${t("note.zoomImageAction")}">
        ${NOTE_IMAGE_ZOOM_ICON}
      </button>
      <button type="button" class="boke-note-image-toolbar__btn boke-note-image-toolbar__delete" title="${t("note.deleteImageAction")}" aria-label="${t("note.deleteImageAction")}">
        ${NOTE_IMAGE_TRASH_ICON}
      </button>
    `;

    captionInput = toolbar.querySelector(".boke-note-image-toolbar__caption-input");
    captionInput?.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        void commitCaption();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeCaptionInput(true);
        if (selected) positionToolbar(selected);
      }
    });
    captionInput?.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    toolbar.querySelector(".boke-note-image-toolbar__edit")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (toolbar?.classList.contains("boke-note-image-toolbar--caption-open")) {
        void commitCaption();
        return;
      }
      openCaptionInput(img);
    });
    toolbar.querySelector(".boke-note-image-toolbar__zoom")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openNoteImageLightbox(img);
    });
    toolbar.querySelector(".boke-note-image-toolbar__delete")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void requestDelete();
    });

    document.body.appendChild(toolbar);
    positionToolbar(img);
  };

  const onDoubleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const img = resolveNoteImage(target, container);
    if (!img) return;

    event.preventDefault();
    event.stopPropagation();
    if (!options.viewOnly && selected !== img) selectImage(img);
    openNoteImageLightbox(img);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (options.viewOnly) {
      if (!target.closest(".boke-note-image-lightbox")) {
        clearSelection();
      }
      return;
    }

    const img = resolveNoteImage(target, container);
    if (img) {
      event.preventDefault();
      event.stopPropagation();
      selectImage(img);
      return;
    }

    if (!target.closest(".boke-note-image-toolbar") && !target.closest(".boke-note-image-lightbox")) {
      clearSelection();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (options.viewOnly) {
      if (event.key === "Escape" && isNoteImageLightboxOpen()) {
        closeNoteImageLightbox();
      }
      return;
    }
    if (!selected) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) {
      if (active.classList.contains("boke-note-image-toolbar__caption-input") || active.closest(".milkdown-image-block")) {
        return;
      }
    }
    if (event.key === "Escape") {
      if (isNoteImageLightboxOpen()) {
        closeNoteImageLightbox();
        return;
      }
      clearSelection();
      return;
    }
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      options.onInsertLineBelow(selected);
      clearSelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void options.onCopy(selected);
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.preventDefault();
    void requestDelete();
  };

  const onScroll = () => {
    if (selected) positionToolbar(selected);
  };

  container.addEventListener("pointerdown", onPointerDown, true);
  container.addEventListener("dblclick", onDoubleClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onScroll, true);
  window.addEventListener("resize", onScroll);

  return () => {
    closeNoteImageLightbox();
    clearSelection();
    container.removeEventListener("pointerdown", onPointerDown, true);
    container.removeEventListener("dblclick", onDoubleClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onScroll);
  };
}
