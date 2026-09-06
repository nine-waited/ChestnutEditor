const COPY_FEEDBACK_MS = 1400;

export function setCodeBlockCopyButtonLabel(button: HTMLElement, label: string): void {
  for (const node of button.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      node.textContent = ` ${label}`;
      return;
    }
  }
}

export function attachCodeBlockCopyFeedback(
  root: HTMLElement,
  labels: { copy: string; copied: string },
): () => void {
  const pending = new Map<HTMLElement, number>();

  const clearButton = (button: HTMLElement) => {
    const timer = pending.get(button);
    if (timer) window.clearTimeout(timer);
    pending.delete(button);
    button.classList.remove("is-copied");
    setCodeBlockCopyButtonLabel(button, labels.copy);
  };

  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button.copy-button");
    if (!(button instanceof HTMLElement) || !root.contains(button)) return;

    const existing = pending.get(button);
    if (existing) window.clearTimeout(existing);
    button.classList.add("is-copied");
    setCodeBlockCopyButtonLabel(button, labels.copied);
    pending.set(
      button,
      window.setTimeout(() => {
        pending.delete(button);
        button.classList.remove("is-copied");
        setCodeBlockCopyButtonLabel(button, labels.copy);
      }, COPY_FEEDBACK_MS),
    );
  };

  root.addEventListener("click", onClick, true);
  return () => {
    root.removeEventListener("click", onClick, true);
    for (const button of pending.keys()) clearButton(button);
  };
}
