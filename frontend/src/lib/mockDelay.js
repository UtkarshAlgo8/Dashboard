/**
 * Returns a Promise that resolves to `value` after a random delay in
 * the [minMs, maxMs] range. Used by the dummy resource modules in
 * src/api/ so the consuming components render loading states the
 * same way they would against a real backend.
 *
 * @template T
 * @param {T} value
 * @param {number} [minMs=200]
 * @param {number} [maxMs=500]
 * @returns {Promise<T>}
 */
export function mockDelay(value, minMs = 200, maxMs = 500) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}
