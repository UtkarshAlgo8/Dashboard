/** Controllers exercised with a deterministic upstream boundary; no Athena/network credentials used. */
import test from "node:test";
import assert from "node:assert/strict";

process.env.AWS_DATA_URL = "http://spc-upstream.invalid";
process.env.AWS_DATA_API_KEY = "test-only";
process.env.QUALITY_DATA_SOURCE = "db";
process.env.CACHE_DRIVER = "memory";
process.env.SPC_CALENDER4_STATIC_ENABLED = "true";

const controller = await import("../controllers/spc.controller.js");
const { config } = await import("../../config.js");
const { _clear } = await import("../../utils/cache.js");
const { staticCapabilityRows, calender4Fixture } =
  await import("./static-calender4.js");

const base = { plant: "BANMORE", date: "2026-11-11", shift: "All" };
const selection = {
  machine: "ROLL_CALENDER_4_0501",
  recipe: "CPJ1218",
  parameter: "Scanner Drive Zone",
};
const invoke = (name, query) =>
  new Promise((resolve, reject) => {
    let status = 200;
    controller[name](
      { query },
      {
        status(code) {
          status = code;
          return this;
        },
        json(body) {
          resolve({ status, body });
        },
      },
      reject,
    );
  });

test("Merged SPC controllers agree across snapshots, filters, detail, trends and observations", async (t) => {
  let upstreamRows = () => [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { sql } = JSON.parse(init.body);
    const rows = upstreamRows(sql);
    return { status: 200, json: async () => ({ rows }) };
  });
  await t.test("Excel-only data survives an empty gold snapshot", async () => {
    await _clear();
    const { body: board } = await invoke("getSpcWidgets", base);
    assert.equal(board.count, 5);
    assert.equal(board.context.snapshot_date, null); // never invent a gold snapshot
    const { body: summary } = await invoke("getSpcSummary", base);
    assert.equal(summary.total_parameters, board.count);
    assert.equal(summary.out_of_specification, 2);
    const { body: filters } = await invoke("getSpcFilterOptions", {
      ...base,
      machine: selection.machine,
    });
    assert.deepEqual(filters.machines, [selection.machine]);
    assert.deepEqual(filters.recipes, [
      "CPJ1218",
      "ECOPOLY 1500",
      "UNIHT1330",
    ]);
    const { body: filtered } = await invoke("getSpcWidgets", {
      ...base,
      recipe: "ECOPOLY 1500",
      headline_status: "Critical",
    });
    assert.equal(filtered.count, 1);
    assert.ok(filtered.widgets.every((w) => w.recipe === "ECOPOLY 1500"));
  });
  await t.test(
    "Published snapshot is date-gated, range-inclusive and all-shifts",
    async () => {
      for (const date of ["2026-11-10", "2026-11-12"]) {
        const { body } = await invoke("getSpcWidgets", { ...base, date });
        assert.equal(body.count, 0);
        const { body: detail } = await invoke("getSpcDetail", {
          ...base,
          ...selection,
          date,
        });
        assert.equal(detail.x_chart, undefined);
      }
      const { body: range } = await invoke("getSpcWidgets", {
        plant: "BANMORE",
        from: "2026-10-01",
        to: "2026-11-30",
      });
      assert.equal(range.count, 5);
      const { body: rangeFilters } = await invoke("getSpcFilterOptions", {
        plant: "BANMORE",
        from: "2026-10-01",
        to: "2026-11-30",
      });
      assert.equal(rangeFilters.machines.length, 1);
      let expected;
      for (const shift of ["All", "A", "B", "C"]) {
        const { body } = await invoke("getSpcDetail", {
          ...base,
          ...selection,
          shift,
        });
        assert.equal(body.context.shift_supported, false);
        assert.equal(body.context.shift, "All");
        assert.equal(body.context.snapshot_date, "2026-11-11");
        expected ??= body.x_chart.points;
        assert.deepEqual(body.x_chart.points, expected);
        assert.equal(body.capability.cp.value, 2.1693);
        assert.equal(body.x_chart.points.length, 44);
      }
    },
  );
  await t.test(
    "Point/MR and histogram observations reconcile to exact detail identities",
    async () => {
      const query = { ...base, ...selection };
      const { body: detail } = await invoke("getSpcDetail", query);
      const { body: x } = await invoke("getPointObservations", {
        ...query,
        point_index: "1",
        chart: "X",
      });
      assert.equal(x.observations_available, true);
      assert.equal(x.observations.length, 1);
      assert.equal(x.point.value, detail.x_chart.points[0].value);
      const { body: blank } = await invoke("getPointObservations", {
        ...query,
        point_index: "1",
        chart: "R",
      });
      assert.equal(blank.observations_available, false);
      assert.equal(blank.point.value, null);
      const { body: range } = await invoke("getPointObservations", {
        ...query,
        point_index: "2",
        chart: "R",
      });
      assert.equal(range.observations.length, 2);
      assert.equal(range.point.value, detail.r_chart.points[1].value);
      let total = 0;
      for (const [i, bin] of detail.histogram.bins.entries()) {
        const { body } = await invoke("getHistogramObservations", {
          ...query,
          bin_index: String(i),
        });
        assert.equal(body.observations.length, bin.count);
        assert.equal(body.bin.count, bin.count);
        total += body.observations.length;
      }
      assert.equal(total, 44);
      assert.equal(
        (await invoke("getPointObservations", { ...query, point_index: "-1" }))
          .body.observations_available,
        false,
      );
    },
  );
  await t.test(
    "Trend returns just one real published point, never fabricated daily history",
    async () => {
      const { body } = await invoke("getSpcTrend", {
        ...base,
        ...selection,
        from: "2026-11-01",
        to: "2026-11-30",
        metric: "Cp",
      });
      assert.deepEqual(body.points, [
        { date: "2026-11-11", value: 2.1693, status: "Healthy" },
      ]);
      const { body: excluded } = await invoke("getSpcTrend", {
        ...base,
        ...selection,
        from: "2026-11-12",
        to: "2026-11-30",
        metric: "Cp",
      });
      assert.deepEqual(excluded.points, []);
    },
  );
  await t.test(
    "Flag disable uses a separate cache identity without flushing other caches",
    async () => {
      assert.equal((await invoke("getSpcWidgets", base)).body.count, 5);
      config.quality.spcCalender4StaticEnabled = false;
      try {
        assert.equal((await invoke("getSpcWidgets", base)).body.count, 0);
        assert.equal(
          (await invoke("getSpcDetail", { ...base, ...selection })).body
            .x_chart,
          undefined,
        );
      } finally {
        config.quality.spcCalender4StaticEnabled = true;
      }
      assert.equal((await invoke("getSpcWidgets", base)).body.count, 5);
    },
  );
  await t.test(
    "Mixed live + static union preserves legacy subgroup charts and does not duplicate partial gold",
    async () => {
      await _clear();
      const liveRows = ["Cp", "Cpk", "Pp", "Ppk"].map((m) => ({
        machine: "VMI_MAXX_01",
        itemcode: "LIVE",
        kpi_name: `Belt 1 Length ${m}`,
        actual_value: 2,
        status: "Healthy",
      }));
      upstreamRows = (sql) => {
        if (sql.includes("AS snapshot_date"))
          return [{ snapshot_date: "2026-11-02" }];
        if (sql.includes("AS baseline_date"))
          return [
            {
              machine: "VMI_MAXX_01",
              kpi_name: "Belt 1 Length UCL",
              actual_value: 12,
              baseline_date: "2026-11-01",
            },
            {
              machine: "VMI_MAXX_01",
              kpi_name: "Belt 1 Length LCL",
              actual_value: 8,
              baseline_date: "2026-11-01",
            },
          ];
        if (sql.includes("silver."))
          return Array.from({ length: 5 }, (_, i) => ({
            machine: "VMI_MAXX_01",
            recipe: "LIVE",
            belt1_length: 10,
            n_belt1_length: 5,
            event_time: `2026-11-02 10:0${i}:00`,
            value: 10,
            setpoint: 10,
          }));
        return sql.includes("ROLL_CALENDER_4")
          ? staticCapabilityRows(calender4Fixture.combinations[0]).slice(0, 2)
          : [
              ...liveRows,
              ...staticCapabilityRows(calender4Fixture.combinations[0]).slice(
                0,
                2,
              ),
            ];
      };
      const { body: board } = await invoke("getSpcWidgets", base);
      assert.equal(board.count, 6);
      assert.equal(
        board.widgets.filter((w) => w.source.kind === "static_excel").length,
        5,
      );
      assert.equal(
        board.widgets.filter((w) => w.source.kind === "live").length,
        1,
      );
      assert.equal(
        (await invoke("getSpcSummary", base)).body.total_parameters,
        6,
      );
      const { body: liveDetail } = await invoke("getSpcDetail", {
        ...base,
        machine: "VMI_MAXX_01",
        recipe: "LIVE",
        parameter: "Belt 1 Length",
      });
      assert.equal(liveDetail.x_chart.subgroup_size, 5);
      assert.equal(liveDetail.x_chart.points.length, 1);
      assert.equal(liveDetail.context.shift_supported, true);
    },
  );
  await t.test(
    "Gold outage is reported, not silently rebranded as static-only success",
    async () => {
      await _clear();
      upstreamRows = () => {
        throw new Error("upstream unavailable");
      };
      await assert.rejects(
        invoke("getSpcWidgets", base),
        /upstream unavailable/,
      );
    },
  );
});
