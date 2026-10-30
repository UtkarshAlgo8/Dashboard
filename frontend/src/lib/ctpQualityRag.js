/**
 * Target-based card colour for the CTP Quality page.
 *
 * A card with a target is Green when it meets the target, Amber when it
 * misses by no more than its amber band, and Red otherwise. A card with no
 * target falls back to the trend rule (better or worse than the previous
 * period). `ctpCardTier` and `describeCtpTier` share the same inputs, so the
 * colour and its info-tooltip text can never disagree.
 *
 * Targets are `{ op: ">=" | "<=" | "<", value }`. The amber band defaults to
 * 2 (percentage points for % KPIs, units for counts).
 */

export const DEFAULT_AMBER_BAND = 2;

const fmt = (n, unit) => `${Number(n.toFixed(2))}${unit === "%" ? "%" : ""}`;

const OP_LABEL = { ">=": "≥", "<=": "≤", "<": "<" };

/** "≥ 95%", "≤ 5", "< 1%" — the card's "Target …" text. */
export function ctpTargetLabel(target, unit) {
  if (!target) return null;
  return `${OP_LABEL[target.op]} ${fmt(target.value, unit)}`;
}

function meets(value, { op, value: t }) {
  if (op === ">=") return value >= t;
  if (op === "<=") return value <= t;
  return value < t;
}

function withinBand(value, { op, value: t }, band) {
  if (op === ">=") return value >= t - band;
  if (op === "<=") return value <= t + band;
  return value < t + band;
}

/**
 * @param {{ value: number|null, target?: {op: string, value: number}|null,
 *   amberBand?: number, trendFavourable?: boolean }} kpi
 * @returns {"green"|"amber"|"red"|null} null = neutral (no colour)
 */
export function ctpCardTier({ value, target, amberBand, trendFavourable }) {
  if (value == null || !Number.isFinite(value)) return null;
  if (target) {
    if (meets(value, target)) return "green";
    if (withinBand(value, target, amberBand ?? DEFAULT_AMBER_BAND)) {
      return "amber";
    }
    return "red";
  }
  if (trendFavourable === true) return "green";
  if (trendFavourable === false) return "red";
  return null;
}

/**
 * One line per tier, for the card's info tooltip.
 *
 * @param {{ target?: {op: string, value: number}|null, amberBand?: number,
 *   unit?: string }} kpi
 * @returns {string[]}
 */
export function describeCtpTier({ target, amberBand, unit }) {
  if (!target) {
    return [
      "No target: colour follows the trend",
      "Green: same as or better than the previous period",
      "Red: worse than the previous period",
      "No colour: no previous period to compare",
    ];
  }
  const band = amberBand ?? DEFAULT_AMBER_BAND;
  const t = fmt(target.value, unit);
  if (target.op === ">=") {
    const edge = fmt(target.value - band, unit);
    return [
      `Green: ${t} or more`,
      `Amber: ${edge} to below ${t}`,
      `Red: below ${edge}`,
    ];
  }
  const edge = fmt(target.value + band, unit);
  if (target.op === "<=") {
    return [
      `Green: ${t} or less`,
      `Amber: above ${t} up to ${edge}`,
      `Red: above ${edge}`,
    ];
  }
  return [
    `Green: below ${t}`,
    `Amber: ${t} to below ${edge}`,
    `Red: ${edge} or more`,
  ];
}
