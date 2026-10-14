/** Tiny DOM helper for extension pages: `h('div', { class: 'x', onclick }, child...)`. */
type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k in el && k !== 'class') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Labelled on/off switch row. */
export function switchRow(
  label: string,
  description: string,
  checked: boolean,
  onChange: (on: boolean) => void,
): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    class: 'switch',
    checked,
    onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
  });
  return h(
    'label',
    { class: 'row' },
    h('div', {}, h('div', {}, label), description ? h('p', {}, description) : null),
    input,
  );
}
