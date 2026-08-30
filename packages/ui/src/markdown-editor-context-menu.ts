export interface EditorContextMenuPoint {
  x: number;
  y: number;
  /** DOM event target under the cursor when opening the menu. */
  target: EventTarget | null;
  event: MouseEvent;
}

export function attachMarkdownEditorContextMenu(
  editorEl: HTMLElement,
  onOpen: (point: EditorContextMenuPoint) => void,
): () => void {
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpen({ x: event.clientX, y: event.clientY, target: event.target, event });
  };

  editorEl.addEventListener("contextmenu", onContextMenu);
  return () => editorEl.removeEventListener("contextmenu", onContextMenu);
}
