import { useEffect, useState } from "react";

/**
 * Returns a value that lags `value` by `delay` ms. Useful for search-as-you-type.
 */
export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
