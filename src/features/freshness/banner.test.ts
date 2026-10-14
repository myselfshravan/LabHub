import { describe, expect, it, vi } from 'vitest';
import { createBanner } from './banner';

const host = () => document.querySelector<HTMLElement>('[data-bgl="freshness-banner"]');

describe('banner', () => {
  it('shows text, reloads on click, and dismisses', () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    const banner = createBanner(onReload, onDismiss);

    banner.show('This page has updates', 'Pipeline: running → success');
    const root = host()!.shadowRoot!;
    expect(root.querySelector('.text')!.textContent).toBe(
      'This page has updatesPipeline: running → success',
    );

    root.querySelector<HTMLButtonElement>('.reload')!.click();
    expect(onReload).toHaveBeenCalledOnce();

    root.querySelector<HTMLButtonElement>('.close')!.click();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(host()).toBeNull();

    banner.show('again', '');
    expect(host()).not.toBeNull();
    banner.destroy();
    expect(host()).toBeNull();
  });
});
