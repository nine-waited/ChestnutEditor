/** Keep live editor scroll stable when `#` input rules change block type (p → h1). */
export function attachLiveEditorScrollLock(editorEl: HTMLElement): () => void {
  const scrollEl = editorEl.closest<HTMLElement>(".chestnut-live-scroll");
  if (!scrollEl) return () => {};

  let anchor = scrollEl.scrollTop;
  let restoreUntil = 0;

  const rememberScroll = () => {
    anchor = scrollEl.scrollTop;
    restoreUntil = performance.now() + 150;
  };

  const restoreScroll = () => {
    if (performance.now() > restoreUntil) return;
    if (scrollEl.scrollTop !== anchor) scrollEl.scrollTop = anchor;
  };

  const scheduleRestore = () => {
    requestAnimationFrame(() => {
      restoreScroll();
      requestAnimationFrame(restoreScroll);
    });
  };

  const onBeforeInput = () => rememberScroll();
  const onInput = () => scheduleRestore();
  const onSelectionChange = () => restoreScroll();

  editorEl.addEventListener("beforeinput", onBeforeInput, true);
  editorEl.addEventListener("input", onInput, true);
  document.addEventListener("selectionchange", onSelectionChange);

  return () => {
    editorEl.removeEventListener("beforeinput", onBeforeInput, true);
    editorEl.removeEventListener("input", onInput, true);
    document.removeEventListener("selectionchange", onSelectionChange);
  };
}
