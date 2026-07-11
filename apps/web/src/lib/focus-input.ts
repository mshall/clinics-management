/** Focus a text input and nudge mobile browsers (especially iOS) to show the soft keyboard. */
export function focusTextInput(el: HTMLInputElement | HTMLTextAreaElement | null | undefined): void {
  if (!el || el.disabled) return;
  el.focus({ preventScroll: true });
  const len = el.value.length;
  try {
    el.setSelectionRange(len, len);
  } catch {
    /* Some input types do not support selection ranges. */
  }
}
