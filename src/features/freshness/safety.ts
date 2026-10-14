/**
 * Decides whether reloading would destroy something the user is doing. When in doubt we report
 * "unsafe" — the cost is only that the user sees a banner instead of an automatic reload.
 */

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'number', '']);

/** Returns a human-readable reason the page must not auto-reload, or null when it's safe. */
export function unsafeReason(doc: Document = document): string | null {
  const active = doc.activeElement as HTMLElement | null;
  if (
    active &&
    (active.tagName === 'TEXTAREA' ||
      (active.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((active as HTMLInputElement).type)) ||
      active.isContentEditable)
  ) {
    return 'you are typing';
  }

  for (const ta of doc.querySelectorAll('textarea')) {
    if (ta.value.trim() && ta.value !== ta.defaultValue) return 'unsaved text in a comment box';
  }
  for (const input of doc.querySelectorAll('input')) {
    if (!TEXT_INPUT_TYPES.has(input.type) || input.readOnly) continue;
    if (input.value.trim() && input.value !== input.defaultValue) return 'unsaved text in a field';
  }
  for (const el of doc.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
    if (el.textContent?.trim()) return 'an editor is open';
  }

  if (doc.querySelector('dialog[open], .modal.show, .gl-drawer[aria-hidden="false"]')) {
    return 'a dialog is open';
  }

  const sel = doc.getSelection?.();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return 'text is selected';

  return null;
}
