import { UpstreamError } from "../../utils/upstream.js";

/** Bound this feature's uncached Athena work without changing other dashboards. */
export function createUniformityLimiter(maxActive = 4, maxQueued = 32) {
  let active = 0;
  const queue = [];
  return async (work) => {
    if (active >= maxActive) {
      if (queue.length >= maxQueued)
        throw new UpstreamError("Uniformity is busy. Please retry shortly.", {
          type: "UNIFORMITY_BUSY",
          status: 503,
        });
      // A finishing request transfers its slot directly to the next waiter.
      await new Promise((resolve) => queue.push(resolve));
    } else active++;
    try {
      return await work();
    } finally {
      if (queue.length) queue.shift()();
      else active--;
    }
  };
}
export const withUniformitySlot = createUniformityLimiter();
