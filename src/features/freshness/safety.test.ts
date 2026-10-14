import { afterEach, describe, expect, it } from 'vitest';
import { unsafeReason } from './safety';

afterEach(() => {
  document.body.innerHTML = '';
  (document.activeElement as HTMLElement | null)?.blur?.();
});

describe('unsafeReason', () => {
  it('is safe on a plain page', () => {
    document.body.innerHTML = '<textarea></textarea><input type="text" value="prefilled">';
    expect(unsafeReason()).toBeNull();
  });

  it('flags a typed comment', () => {
    document.body.innerHTML = '<textarea></textarea>';
    document.querySelector('textarea')!.value = 'LGTM';
    expect(unsafeReason()).toMatch(/comment/);
  });

  it('flags a focused input even when empty', () => {
    document.body.innerHTML = '<input type="search">';
    document.querySelector('input')!.focus();
    expect(unsafeReason()).toMatch(/typing/);
  });

  it('flags open rich-text editors and dialogs', () => {
    document.body.innerHTML = '<div contenteditable="true">draft</div>';
    expect(unsafeReason()).toMatch(/editor/);
    document.body.innerHTML = '<div class="modal show"></div>';
    expect(unsafeReason()).toMatch(/dialog/);
  });

  it('ignores non-text inputs', () => {
    document.body.innerHTML = '<input type="checkbox">';
    document.querySelector('input')!.checked = true;
    expect(unsafeReason()).toBeNull();
  });
});
