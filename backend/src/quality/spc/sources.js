/** One whole-combination precedence policy shared by every SPC endpoint. */
import { groupCombos, validateLimits, STATUS_SEVERITY } from "./engine.js";
import { resolveSilver, baselineKey } from "./mapping.js";
import { toSpcWidgets } from "../transformers/spc.transformers.js";
import { toIndividualWidget } from "./individuals.js";
import { spcIdentity, calender4Provenance } from "./static-calender4.js";

export function completeLiveCombo(
  combo,
  { limitsIndex, seriesIndex, mapped = resolveSilver },
) {
  const limit = limitsIndex.get(baselineKey(combo.machine, combo.parameter, combo.recipe));
  const series = seriesIndex.get(
    `${combo.machine.toUpperCase()}|||${combo.recipe}|||${combo.parameter}`,
  );
  return (
    Boolean(mapped(combo.machine, combo.parameter)) &&
    ["Cp", "Cpk", "Pp", "Ppk"].every((m) => {
      const cell = combo.metrics[m];
      return (
        cell &&
        (cell.status === "Insufficient Data" ||
          (STATUS_SEVERITY.includes(cell.status) &&
            Number.isFinite(cell.value)))
      );
    }) &&
    validateLimits(limit?.ucl, limit?.lcl).valid &&
    Boolean(series?.means?.some((value) => Number.isFinite(value)))
  );
}

export function mergeSpcSources(liveRows, staticCombos, deps) {
  // Normalize identities before grouping; never normalize recipe case or spacing internally.
  const normalized = liveRows.map((r) => ({
    ...r,
    machine: String(r.machine).trim().toUpperCase(),
    itemcode: String(r.itemcode ?? "").trim(),
  }));
  const liveCombos = [...groupCombos(normalized).values()];
  const byKey = new Map(liveCombos.map((c) => [spcIdentity(c), c]));
  const replacements = staticCombos.filter((c) => {
    const live = byKey.get(spcIdentity(c));
    return !live || !completeLiveCombo(live, deps);
  });
  const replaced = new Set(replacements.map(spcIdentity));
  const live = toSpcWidgets(normalized, deps)
    .widgets.filter((w) => !replaced.has(spcIdentity(w)))
    .map((w) => ({ ...w, source: { kind: "live" } }));
  const widgets = [
    ...live,
    ...replacements.map((c) => toIndividualWidget(c, calender4Provenance(c))),
  ];
  const rank = {
    Critical: 0,
    Major: 1,
    Warning: 2,
    Healthy: 3,
    "Insufficient Data": 4,
  };
  widgets.sort(
    (a, b) =>
      (rank[a.headline_status] ?? 9) - (rank[b.headline_status] ?? 9) ||
      (a.cpk ?? Infinity) - (b.cpk ?? Infinity) ||
      spcIdentity(a).localeCompare(spcIdentity(b)),
  );
  return widgets;
}

export function staticSelection(widgets, eligible, query) {
  const key = spcIdentity(query);
  return widgets.some(
    (w) => spcIdentity(w) === key && w.source?.kind === "static_excel",
  )
    ? (eligible.find((c) => spcIdentity(c) === key) ?? null)
    : null;
}
