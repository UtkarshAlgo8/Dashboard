/**
 * Single source of truth for how a full date is DISPLAYED to the user.
 *
 * The app stores and exchanges dates as ISO `yyyy-mm-dd` (see lib/timeRange.js),
 * but every on-screen date is rendered as `dd-mm-yyyy`. Route all display
 * formatting through here so the format stays consistent everywhere.
 *
 * Accepts an ISO `yyyy-mm-dd` string (optionally with a trailing time
 * component), a `Date`, or a value already in `dd-mm-yyyy`. Anything else is
 * returned unchanged, so callers can pass raw row values without a guard.
 *
 * @param {string|Date|null|undefined} value
 * @returns {string|null|undefined} `dd-mm-yyyy`, or the input untouched
 */
export function toDisplayDate(value) {
  if (value == null || value === "") return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${value.getFullYear()}`;
  }
  if (typeof value !== "string") return value;
  const base = value.includes("T")
    ? value.slice(0, value.indexOf("T"))
    : value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base);
  return iso ? `${iso[3]}-${iso[2]}-${iso[1]}` : value;
}
