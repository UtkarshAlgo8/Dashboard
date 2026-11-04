import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import XLSX from "xlsx";
import {
  excelTime,
  importCalender4,
} from "../../../tools/import-spc-calender4.js";
import {
  calender4Fixture as fixture,
  eligibleCalender4,
  calender4Provenance,
  staticCapabilityRows,
  summaryFromWidgets,
  spcIdentity,
} from "./static-calender4.js";
import { mergeSpcSources, staticSelection } from "./sources.js";
import {
  individualSeries,
  toIndividualDetail,
  deviationHistogram,
} from "./individuals.js";
import {
  spcLinePath,
  spcChartGuides,
} from "../../../../frontend/src/lib/spcCharts.js";

const combo = fixture.combinations[0];
const date = "2026-11-04";
const deps = () => ({ limitsIndex: new Map(), seriesIndex: new Map() });

function workbookBuffer() {
  const serial = (value) =>
    (Date.parse(
      value.replace(" ", "T") + (value.includes(" ") ? "Z" : "T00:00:00Z"),
    ) -
      Date.UTC(1899, 11, 30)) /
    86400000;
  const kpis = fixture.combinations.flatMap((c) => [
    ...Object.entries(c.metrics).map(([m, cell]) => ({
      date: serial(c.snapshot_date),
      plant: c.plant,
      machine: c.machine,
      itemcode: c.recipe,
      section: c.section,
      granularity: "Day",
      department: "Quality",
      category: "SPC",
      kpi_name: `${c.parameter} ${m}`,
      actual_value: cell.value,
      status: cell.status,
    })),
    ...Object.entries(c.spec).map(([bound, value]) => ({
      date: serial(c.snapshot_date),
      plant: c.plant,
      machine: c.machine,
      itemcode: c.recipe,
      section: c.section,
      granularity: "Day",
      department: "Quality",
      category: "SPC",
      kpi_name: `${c.parameter} ${bound.toUpperCase()}`,
      actual_value: value,
      status: "Reference",
    })),
  ]);
  const readings = fixture.combinations.flatMap((c) =>
    c.readings.map((r) => ({
      ...r,
      date: serial(r.date),
      event_time: serial(r.event_time),
      plant: c.plant,
      machine: c.machine,
      itemcode: c.recipe,
      parameter: c.parameter,
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(kpis),
    "SPC KPIs",
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(readings),
    "Raw Data",
  );
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

test("Calender 4 fixture inventory, published capability and headline reconciliation", () => {
  assert.equal(fixture.source_file, "SPC_Calender4_4Nov.xlsx");
  assert.equal(fixture.kpi_rows, 72);
  assert.equal(fixture.reading_rows, 769);
  assert.equal(fixture.combinations.length, 12);
  assert.ok(
    fixture.combinations.every(
      (c) => c.machine === "ROLL_CALENDER_4_0501" && c.snapshot_date === date,
    ),
  );
  assert.deepEqual(
    fixture.combinations
      .filter((c) => c.recipe === "CPJ1218_B370" || c.recipe === "ECOPOLY 1500")
      .map((c) => c.parameter),
    ["Scanner Drive Zone", "Scanner Drive Zone", "Scanner Water Zone"],
  );
  assert.deepEqual(
    fixture.combinations.map((c) => c.readings.length),
    [50, 68, 67, 39, 140, 42, 57, 67, 33, 48, 126, 32],
  );
  assert.equal(
    fixture.combinations.reduce((n, c) => n + c.readings.length, 0),
    769,
  );
  const widgets = mergeSpcSources([], eligibleCalender4({ date }), deps());
  assert.deepEqual(summaryFromWidgets(widgets), {
    total_parameters: 12,
    out_of_specification: 7,
    marginal: 1,
    not_capable: 0,
    capable: 4,
    insufficient_data: 0,
  });
  const healthy = widgets.find(
    (w) => w.headline_status === "Healthy" && w.recipe === "UNIHT1330",
  );
  assert.equal(
    widgets.filter((w) => w.headline_status === "Healthy").length,
    4,
  );
  assert.equal(healthy.recipe, "UNIHT1330");
  assert.equal(healthy.parameter, "Scanner Water Zone");
  const mixed = widgets.find(
    (w) => w.recipe === "ECOPOLY 1500" && w.parameter === "Scanner Drive Zone",
  );
  assert.equal(mixed.cp_status, "Warning");
  assert.equal(mixed.cpk_status, "Warning");
  assert.equal(mixed.headline_status, "Critical");
});

test("Offline importer validates both sheets and preserves numeric values and wall-clock dates", () => {
  const imported = importCalender4(workbookBuffer(), "roundtrip.xlsx");
  assert.equal(imported.reading_rows, 769);
  assert.equal(imported.kpi_rows, 72);
  assert.deepEqual(imported.combinations, fixture.combinations);
  assert.throws(
    () => importCalender4(Buffer.from("not a workbook"), "bad.xlsx"),
    /Missing sheet/,
  );
});

test("Excel serial decoding is independent of process timezone", () => {
  assert.equal(excelTime(46330), date);
  const script = `import { excelTime } from ${JSON.stringify(new URL("../../../tools/import-spc-calender4.js", import.meta.url).href)}; process.stdout.write(excelTime(46328) + '|' + excelTime(46322.75694444445, true));`;
  for (const TZ of ["UTC", "Asia/Kolkata", "America/Los_Angeles"]) {
    assert.equal(
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        env: { ...process.env, TZ },
      }).toString(),
      "2026-11-02|2026-10-27 18:10:00",
    );
  }
});

test("Exact day / inclusive range eligibility, plant gating, shifts and disable", () => {
  assert.equal(eligibleCalender4({ date }).length, 12);
  assert.equal(eligibleCalender4({ date: "2026-11-03" }).length, 0);
  assert.equal(eligibleCalender4({ date: "2026-11-05" }).length, 0);
  assert.equal(eligibleCalender4({ from: date, to: date }).length, 12);
  assert.equal(
    eligibleCalender4({ from: "2026-10-01", to: "2026-11-01" }).length,
    0,
  );
  assert.equal(
    eligibleCalender4({ from: "2026-11-01", to: "2026-11-30" }).length,
    12,
  );
  assert.equal(eligibleCalender4({ date, plant: "CHENNAI" }).length, 0);
  assert.equal(eligibleCalender4({ date }, false).length, 0);
  assert.equal(
    eligibleCalender4({
      date,
      machine: combo.machine.toLowerCase(),
      recipe: combo.recipe,
    }).length,
    2,
  );
  for (const shift of ["All", "A", "B", "C"]) {
    assert.deepEqual(
      eligibleCalender4({ date, shift }),
      eligibleCalender4({ date }),
    );
  }
});

test("Whole-combination merge keeps partial live data from overwriting Excel; complete mapped live wins", () => {
  const rows = staticCapabilityRows(combo);
  const d = deps();
  d.mapped = () => ({ table: "test.mapped" });
  d.limitsIndex.set(`${combo.machine}|||${combo.parameter}`, {
    ucl: 2,
    lcl: -2,
  });
  d.seriesIndex.set(`${combo.machine}|||${combo.recipe}|||${combo.parameter}`, {
    means: [0, 1],
    times: ["t1", "t2"],
  });
  const resolved = mergeSpcSources(rows, [combo], d);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].source.kind, "live");
  assert.equal(
    mergeSpcSources(rows.slice(0, 3), [combo], d)[0].source.kind,
    "static_excel",
  );
  assert.equal(
    mergeSpcSources(rows, [combo], { ...d, mapped: () => null })[0].source.kind,
    "static_excel",
  );
  assert.equal(
    mergeSpcSources(rows, [combo], { ...d, seriesIndex: new Map() })[0].source
      .kind,
    "static_excel",
  );
  assert.equal(
    mergeSpcSources(rows, [combo], { ...d, limitsIndex: new Map() })[0].source
      .kind,
    "static_excel",
  );
  const explicit = rows.map((r) => ({
    ...r,
    actual_value: null,
    status: "Insufficient Data",
  }));
  assert.equal(mergeSpcSources(explicit, [combo], d)[0].source.kind, "live");
  assert.equal(staticSelection(resolved, [combo], combo), null);
  const staticBoard = mergeSpcSources([], [combo], deps());
  assert.equal(
    staticSelection(staticBoard, [combo], { ...combo, plant: "BTP" }),
    combo,
  );
  assert.equal(
    spcIdentity(combo),
    spcIdentity({
      ...combo,
      machine: combo.machine.toLowerCase(),
      plant: "BTP",
    }),
  );
  assert.equal(mergeSpcSources(rows, fixture.combinations, deps()).length, 12);
});

test("Every fixture detail preserves readings, spec scale, MR gaps, histogram memberships and alert linkage", () => {
  for (const c of fixture.combinations) {
    const detail = toIndividualDetail(c, calender4Provenance(c));
    assert.equal(detail.capability.cpk.value, c.metrics.Cpk.value);
    assert.equal(detail.x_chart.points.length, c.readings.length);
    assert.equal(
      detail.x_chart.points[0].value,
      c.readings[0].actual_value - c.readings[0].setpoint,
    );
    assert.equal(detail.x_chart.lsl, -0.04);
    assert.equal(detail.x_chart.usl, 0.04);
    assert.equal(detail.x_chart.ucl, undefined);
    assert.equal(detail.x_chart.unit, null);
    const starts = detail.x_chart.points.filter((p) => p.break_before).length;
    const ranges = detail.r_chart.points.filter((p) => p.value != null);
    assert.equal(ranges.length, c.readings.length - starts);
    assert.equal(
      detail.x_chart.sigma,
      ranges.reduce((sum, p) => sum + p.value, 0) / ranges.length / 1.128,
    );
    for (const p of detail.r_chart.points) {
      assert.equal(p.value == null, p.break_before);
      assert.deepEqual(p.rules, []);
      assert.deepEqual(p.alert_ids, []);
    }
    assert.equal(detail.histogram.bins.length, 20);
    assert.equal(
      detail.histogram.bins.reduce((n, b) => n + b.count, 0),
      c.readings.length,
    );
    detail.histogram.bins.forEach((b, i, bins) => {
      const n = detail.x_chart.points.filter(
        (p) =>
          p.value >= b.from &&
          (i === bins.length - 1 ? p.value <= b.to : p.value < b.to),
      ).length;
      assert.equal(n, b.count);
    });
    assert.equal(
      detail.histogram.out_of_spec.count,
      detail.x_chart.points.filter((p) => p.out_of_spec).length,
    );
    for (const a of detail.alerts) {
      const members = detail.x_chart.points.slice(
        a.points.first - 1,
        a.points.last,
      );
      assert.ok(
        members.every(
          (p) =>
            p.segment === a.segment &&
            p.alert_ids.includes(a.alert_id) &&
            p.rules.includes(a.rule),
        ),
      );
      assert.equal(a.time.first, members[0].time);
      assert.equal(a.time.last, members.at(-1).time);
    }
  }
});

test("Moving range and Nelson windows never cross runs; zero sigma is explicit", () => {
  const readings = Array.from({ length: 10 }, (_, i) => ({
    event_time: `t${i}`,
    segment: i < 5 ? 1 : 2,
    actual_value: 0.5 + (i % 2) * 0.1,
    setpoint: 0,
  }));
  const series = individualSeries(readings);
  assert.equal(series.ranges[0].value, null);
  assert.equal(series.ranges[5].value, null);
  const d = toIndividualDetail({ ...combo, readings }, {});
  assert.equal(d.x_chart.nelson.find((r) => r.rule === 2).hit, false); // ten points on one side, but only five/run
  const constant = toIndividualDetail(
    { ...combo, readings: readings.map((r) => ({ ...r, actual_value: 0 })) },
    {},
  );
  assert.equal(constant.x_chart.sigma, 0);
  assert.equal(constant.x_chart.nelson_evaluated, false);
  assert.deepEqual(constant.alerts, []);
  assert.deepEqual(constant.histogram.curve.x, []);
  assert.equal(
    constant.histogram.bins.reduce((n, b) => n + b.count, 0),
    10,
  );
  const singles = toIndividualDetail(
    { ...combo, readings: readings.slice(0, 1) },
    {},
  );
  assert.equal(singles.x_chart.sigma, null);
  assert.ok(!JSON.stringify(singles).includes("NaN"));
});

test("Spec boundaries are inclusive and do not use raw actual values", () => {
  const d = deviationHistogram(
    [-0.041, -0.04, 0, 0.04, 0.041],
    { lsl: -0.04, usl: 0.04 },
    0,
    0.01,
  );
  assert.equal(d.out_of_spec.count, 2);
  assert.equal(d.curve.x.length, 100);
  const centre = d.curve.x.reduce(
    (best, x, i) => (Math.abs(x) < Math.abs(d.curve.x[best]) ? i : best),
    0,
  );
  assert.ok(
    Math.abs(
      d.curve.y[centre] - (5 * d.bin_width) / (0.01 * Math.sqrt(2 * Math.PI)),
    ) < 0.01,
  );
});

test("SVG paths retain gaps/segments, and spec guides never become control limits", () => {
  const points = [
    { value: 1, segment: 1 },
    { value: 2, segment: 1 },
    { value: null, segment: 2 },
    { value: 3, segment: 2 },
    { value: 4, segment: 3 },
  ];
  const path = spcLinePath(
    points,
    (i) => i,
    (v) => v,
  );
  assert.equal(path.trim(), "M0,1 L1,2  M3,3 M4,4");
  assert.deepEqual(
    spcChartGuides({ lsl: -0.04, usl: 0.04 }).map((g) => g.label),
    ["USL", "LSL"],
  );
});
