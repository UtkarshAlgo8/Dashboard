/**
 * Number formatting utilities using the Indian numbering system (en-IN).
 *
 * Example groupings:
 *   1,000
 *   10,000
 *   1,00,000 (1 Lakh)
 *   10,00,000 (10 Lakhs)
 *   1,00,00,000 (1 Crore)
 */

/**
 * Format a numeric value into the Indian numbering system.
 *
 * @param {number|string|null|undefined} value - value to format
 * @param {object} [options]
 * @param {number} [options.decimals] - exact decimal places to show
 * @param {number} [options.maxDecimals=2] - maximum decimal places
 * @param {number} [options.minDecimals=0] - minimum decimal places
 * @param {string} [options.fallback="—"] - string to return for null/undefined/NaN
 * @returns {string} formatted string with Indian comma grouping
 */
export function formatIndianNumber(value, options = {}) {
  const { fallback = "—", decimals, maxDecimals = 2, minDecimals = 0 } = options;

  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "—" || trimmed === "-" || trimmed === "") return fallback;
    const parsed = Number(trimmed.replace(/,/g, ""));
    if (Number.isNaN(parsed)) return value;
    value = parsed;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const intlOpts = {};
  if (decimals !== undefined) {
    intlOpts.minimumFractionDigits = decimals;
    intlOpts.maximumFractionDigits = decimals;
  } else {
    if (minDecimals !== undefined) intlOpts.minimumFractionDigits = minDecimals;
    if (maxDecimals !== undefined) intlOpts.maximumFractionDigits = maxDecimals;
  }

  return value.toLocaleString("en-IN", intlOpts);
}

/**
 * Convenience helper to round and format an integer value using the Indian numbering system.
 *
 * @param {number|string|null|undefined} value
 * @param {string} [fallback="—"]
 * @returns {string}
 */
export function formatIndianInteger(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(num)) return fallback;
  return Math.round(num).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
