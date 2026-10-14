/** Small DOM utilities shared by features. */

/** Resolves with `probe()`'s first truthy result, polling until `timeoutMs`; undefined on timeout/abort. */
export function waitFor<T>(
  probe: () => T | null | undefined | false,
  {
    timeoutMs = 10_000,
    intervalMs = 250,
    signal,
  }: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {},
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      if (signal?.aborted) return resolve(undefined);
      const v = probe();
      if (v) return resolve(v);
      if (Date.now() >= deadline) return resolve(undefined);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
