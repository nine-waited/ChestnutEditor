import { normalizeCodeText, readCodeBlockDisplayedText } from "./markdown-code-block-sync.js";

const CODE_BLOCK_SELECTOR = ".milkdown-code-block";
const TOGGLE_SELECTOR = "button.preview-toggle-button";
const HOST_SELECTOR = ".codemirror-host";

/**
 * Crepe keeps "preview only" in component state, which resets whenever the code-block
 * node view remounts (off-screen teardown, replaceAll, desync remount). Remember the
 * choice per note + fence text for the session so diagrams stay collapsed.
 */
const previewOnlyByKey = new Map<string, boolean>();

export function codeBlockPreviewMemoryKey(scope: string, text: string): string {
  return `${scope}\n${normalizeCodeText(text).trim()}`;
}

export function rememberCodeBlockPreviewOnly(key: string, previewOnly: boolean): void {
  if (previewOnly) previewOnlyByKey.set(key, true);
  else previewOnlyByKey.delete(key);
}

export function recalledCodeBlockPreviewOnly(key: string): boolean {
  return previewOnlyByKey.get(key) === true;
}

function isPreviewOnly(block: Element): boolean {
  return block.querySelector(HOST_SELECTOR)?.classList.contains("hidden") === true;
}

export function attachCodeBlockPreviewMemory(
  root: HTMLElement,
  getScope: () => string,
): () => void {
  const keyOf = (block: HTMLElement): string | null => {
    const text = readCodeBlockDisplayedText(block);
    return text.trim() ? codeBlockPreviewMemoryKey(getScope(), text) : null;
  };

  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(TOGGLE_SELECTOR);
    const block = button?.closest(CODE_BLOCK_SELECTOR);
    if (!(block instanceof HTMLElement) || !root.contains(block)) return;
    const key = keyOf(block);
    if (!key) return;
    // Capture runs before Vue's toggle, so record the state it is about to flip to.
    rememberCodeBlockPreviewOnly(key, !isPreviewOnly(block));
  };

  let frame = 0;
  const restore = () => {
    frame = 0;
    if (previewOnlyByKey.size === 0) return;
    for (const block of root.querySelectorAll<HTMLElement>(CODE_BLOCK_SELECTOR)) {
      const button = block.querySelector<HTMLElement>(TOGGLE_SELECTOR);
      if (!button || isPreviewOnly(block)) continue;
      const key = keyOf(block);
      if (key && recalledCodeBlockPreviewOnly(key)) button.click();
    }
  };

  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(restore);
  });
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("click", onClick, true);

  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    root.removeEventListener("click", onClick, true);
  };
}
