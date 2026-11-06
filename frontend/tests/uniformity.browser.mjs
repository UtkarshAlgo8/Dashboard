/* global process */
/** Mock-only full-dashboard browser regression. No backend or production calls.
 * PLAYWRIGHT_MODULE may point at an already-installed Playwright ESM entry.
 */
import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
process.env.VITE_API_BASE_URL = "/api/v1";
const root = new URL("../", import.meta.url).pathname;
const vite = await createServer({
  root,
  cacheDir: new URL("../dist/.uniformity-browser-cache", import.meta.url)
    .pathname,
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
});
await vite.listen();
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1520, height: 1100 } });
const requests = [],
  errors = [];
let failDbm = true,
  delayedMtms = false,
  emptyDbm = false,
  paintDelay = 600,
  paintFail = false;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const user = {
  id: 1,
  username: "Uniformity fixture",
  fullName: "Uniformity fixture",
  email: "qa@example.test",
  role: "admin",
  roles: [],
};
const kpis = [
  "Overall_Production_Yield",
  "Overall_Uniformity_Production",
  "Mtms_Uniformity_Yield",
  "Tuo_Uniformity_Yield",
  "Zf_Uniformity_Yield",
  "Zf_Balancing_Yield_o",
  "Dbm_Balancing_Yield",
  "Paint_Wt_Within3_Pct_overall",
];
const values = Object.fromEntries(
  kpis.map((kpi) => [
    kpi,
    {
      actual_value: 95,
      unit: "%",
      drill_down: { is_leaf: true, children: [] },
    },
  ]),
);
values.Overall_Production_Yield.drill_down = {
  is_leaf: false,
  children: ["Mtms_Uniformity_Yield", "Zf_Uniformity_Yield"],
};
values.Overall_Uniformity_Production.drill_down = {
  is_leaf: false,
  children: ["Mtms_Uniformity_Production"],
};
const legacyRequests = [];
const trendRequests = [];
const respond = (route, data, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  });
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  if (!url.pathname.startsWith("/api/v1/")) return route.continue();
  const q = url.searchParams;
  if (url.pathname.includes("/uniformity/")) {
    requests.push({ path: url.pathname, params: Object.fromEntries(q) });
    const kind = url.pathname.split("/").at(-1),
      card = q.get("card"),
      level = q.get("level");
    assert.equal(q.get("plant"), "BANMORE");
    assert.ok(
      q.get("from") && q.get("to") && q.get("period") && q.get("shift"),
    );
    const offset = Number(q.get("offset") ?? 0),
      limit = Number(q.get("limit"));
    let all;
    if (kind === "gold") {
      if (card === "dbm" && failDbm) {
        failDbm = false;
        return respond(
          route,
          {
            error: {
              code: "FIXTURE_ERROR",
              message: "Fixture Uniformity outage",
            },
          },
          502,
        );
      }
      if (level === "machine") {
        if (delayedMtms && card === "mtms" && q.get("period") === "day")
          await delay(700);
        all =
          emptyDbm && card === "dbm"
            ? []
            : [
                {
                  machine:
                    delayedMtms && card === "mtms" && q.get("period") === "day"
                      ? "STALE-MTMS"
                      : "MICROPOISE",
                  yield_pct: 91.25,
                  tyres_tested: 1002,
                },
                ...(card === "mtms" && !delayedMtms
                  ? [{ machine: "ALPHA", yield_pct: 98, tyres_tested: 20 }]
                  : []),
                ...(card === "mtms" && q.get("period") === "range"
                  ? [
                      { machine: "30-0224", yield_pct: 99, tyres_tested: 10 },
                      {
                        machine: "NEW-FACTUAL-729",
                        yield_pct: 97,
                        tyres_tested: 11,
                      },
                    ]
                  : []),
                ...(card === "zf-uniformity" && q.get("period") === "range"
                  ? [{ machine: "ZF-01", yield_pct: 92, tyres_tested: 10 }]
                  : []),
              ];
      } else if (level === "sku") {
        assert.ok(
          ["MICROPOISE", "30-0224", "NEW-FACTUAL-729", "ZF-01"].includes(
            q.get("machine"),
          ),
        );
        all = [
          { sku: "SAP-01", yield_pct: 92.5, tyres_tested: 1002 },
          ...(card === "mtms"
            ? [{ sku: "AAA-01", yield_pct: 90, tyres_tested: 10 }]
            : []),
        ];
      } else {
        assert.equal(q.get("sku"), "SAP-01");
        assert.notEqual(card, "tuo");
        all = [
          {
            parameter:
              card === "dbm" || card === "zf-balancing"
                ? "Upper Unbalance"
                : "RFV CW",
            failed_tyres: 201,
            failed_pct: 20.06,
          },
          ...(card === "mtms"
            ? [{ parameter: "Conicity", failed_tyres: 12, failed_pct: 1.2 }]
            : []),
        ];
      }
    } else {
      assert.ok(q.get("machine") && q.get("sku") && q.get("parameter"));
      assert.notEqual(card, "tuo");
      if (kind === "points") {
        assert.ok(["mtms", "dbm"].includes(card));
        all = Array.from({ length: 1002 }, (_, n) => ({
          barcode: `TYRE-${n}`,
          test_time: `2026-11-01 08:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
          shift: "A",
          actual_value: n % 23,
          grade: n % 5 === 0 ? "C" : "A",
          is_off_spec: n % 5 === 0 ? 1 : 0,
        }));
      } else
        all = Array.from({ length: 201 }, (_, n) => ({
          barcode:
            n === 1
              ? "Z-1"
              : n === 2
                ? "A-2"
                : n === 3
                  ? "B-10"
                  : `FAILED-${n}`,
          test_time:
            n === 1
              ? "2026-11-05 10:00:00.000"
              : n === 2
                ? "2026-11-01 08:00:00.000"
                : n === 3
                  ? "2026-11-05 23:30:00.000"
                  : "2026-11-03 08:00:00.000",
          shift: "A",
          actual_value: card.startsWith("zf") ? null : n,
          grade: n === 1 ? "2" : n === 2 ? "10" : "3",
        }));
    }
    return respond(route, {
      data: {
        context: Object.fromEntries(q),
        rows: all.slice(offset, offset + limit),
        total: all.length,
        offset,
        limit,
        has_more: offset + limit < all.length,
        truncated: false,
      },
    });
  }
  if (url.pathname.endsWith("/auth/current-user"))
    return respond(route, { data: { user } });
  if (url.pathname.endsWith("/plants/banmore"))
    return respond(route, {
      data: { id: "banmore", name: "Banmore", shortName: "BTP", enabled: true },
    });
  if (url.pathname.endsWith("/as-of"))
    return respond(route, { data: { asOf: "2026-11-05" } });
  if (url.pathname.endsWith("/product/uniformity-trend")) {
    trendRequests.push(Object.fromEntries(q));
    return respond(route, { data: { rows: [] } });
  }
  if (url.pathname.endsWith("/product/summary"))
    return respond(route, { data: { values } });
  if (url.pathname.endsWith("/product/children")) {
    legacyRequests.push(Object.fromEntries(q));
    const names = q.get("kpi_names");
    if (names === "Mtms_Uniformity_Yield,Zf_Uniformity_Yield")
      return respond(route, {
        data: {
          rows: [
            {
              kpi_name: "Mtms_Uniformity_Yield",
              machine: null,
              actual_value: 95,
              unit: "%",
              drill_down: { is_leaf: true, children: [] },
            },
            {
              kpi_name: "Zf_Uniformity_Yield",
              machine: null,
              actual_value: 92,
              unit: "%",
              drill_down: null,
            },
          ],
        },
      });
    if (names === "Mtms_Uniformity_Production")
      return respond(route, {
        data: {
          rows: [
            {
              kpi_name: names,
              machine: "MT-01",
              actual_value: 20,
              unit: "NOS",
              drill_down: { is_leaf: true, children: [] },
            },
          ],
        },
      });
    if (names.startsWith("Paint_Wt_")) {
      if (paintFail)
        return respond(
          route,
          { error: { message: "Fixture paint outage" } },
          502,
        );
      await delay(paintDelay);
      return respond(route, { data: { rows: [] } });
    }
    throw new Error(`Unexpected legacy KPI request: ${names}`);
  }
  if (url.pathname.endsWith("/dashboard/kpi-data"))
    return respond(route, { data: [] });
  return respond(route, {
    data: { values: {}, rows: [], points: [], series: {} },
  });
});
await page.addInitScript((u) => {
  localStorage.setItem("jkdash.accessToken", "fixture-only");
  localStorage.setItem("jkdash.user", JSON.stringify(u));
}, user);
// Records every loader ever rendered: branded JKLoader text vs generic MUI spinner.
await page.addInitScript(() => {
  window.__loaders = { jk: new Set(), spinner: 0, where: [] };
  const scan = () => {
    document
      .querySelectorAll(".jk-wait-text")
      .forEach((n) => window.__loaders.jk.add(n.textContent.trim()));
    document
      .querySelectorAll('.MuiCircularProgress-root,[role="progressbar"]')
      .forEach((n) => {
        if (n.__seen) return;
        n.__seen = true;
        // Intentional exception outside drills: the unlabelled auth route guard.
        const label = n.getAttribute("aria-label");
        if (!label) return;
        window.__loaders.spinner += 1;
        window.__loaders.where.push(
          n.getAttribute("aria-label") +
            "|" +
            n.parentElement?.outerHTML.slice(0, 160),
        );
      });
  };
  new MutationObserver(scan).observe(document, {
    childList: true,
    subtree: true,
  });
});
async function text(value) {
  return page.getByText(value, { exact: true }).first();
}
async function clickText(value) {
  await (await text(value)).click();
}
async function waitFor(value) {
  await (await text(value)).waitFor({ timeout: 20000 });
}
async function drillCard(title) {
  await page.getByText(title, { exact: true }).first().click();
  await page.getByRole("button", { name: "MICROPOISE", exact: true }).waitFor();
}
async function toParameter() {
  await page.getByRole("button", { name: "MICROPOISE", exact: true }).click();
  await page.getByRole("button", { name: "SAP-01", exact: true }).click();
}
try {
  await page.goto(`${origin}/banmore/quality`);
  await clickText("Product");
  await waitFor("MTMS Uniformity Yield");
  assert.equal(requests.length, 0, "No Uniformity drill preload");
  await page
    .getByRole("button", {
      name: "View Overall Production Yield trend",
      exact: true,
    })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await clickText("MTMS Uniformity Yield");
  await delay(100);
  assert.equal(requests.length, 0, "Quality does not invoke the new drill API");
  await page.goto(`${origin}/banmore/technical`);
  await page.getByRole("tab", { name: "Uniformity & Balancing" }).click();
  await drillCard("MTMS Uniformity Yield");
  const mtmsCard = await page
    .getByText("MTMS Uniformity Yield", { exact: true })
    .first()
    .boundingBox();
  const tuoCard = await page
    .getByText("TUO Uniformity Yield", { exact: true })
    .first()
    .boundingBox();
  const drillTable = await page.locator("tbody tr").first().boundingBox();
  assert.ok(
    tuoCard.y > mtmsCard.y && drillTable.x > mtmsCard.x,
    "Vertical cards and right-hand drill layout",
  );
  const firstColumn = () =>
    page.locator("tbody tr td:first-child").allTextContents();
  const sortHeader = async (label) =>
    page.getByRole("columnheader", { name: new RegExp(`^${label}`) }).click();
  let count = requests.length;
  await sortHeader("Machine");
  assert.deepEqual(await firstColumn(), ["MICROPOISE", "ALPHA"]);
  await sortHeader("Machine");
  assert.deepEqual(await firstColumn(), ["ALPHA", "MICROPOISE"]);
  assert.equal(requests.length, count, "Sorting does not request other pages");
  await page.getByRole("button", { name: "MICROPOISE", exact: true }).click();
  await page.getByRole("button", { name: "SAP-01", exact: true }).waitFor();
  count = requests.length;
  await sortHeader("SKU");
  assert.deepEqual(await firstColumn(), ["SAP-01", "AAA-01"]);
  await sortHeader("SKU");
  assert.deepEqual(await firstColumn(), ["AAA-01", "SAP-01"]);
  assert.equal(requests.length, count);
  await page.getByRole("button", { name: "SAP-01", exact: true }).click();
  await page.getByRole("button", { name: "RFV CW", exact: true }).waitFor();
  count = requests.length;
  await sortHeader("Failed tyres");
  assert.deepEqual(await firstColumn(), ["RFV CW", "Conicity"]);
  await sortHeader("Failed tyres");
  assert.deepEqual(await firstColumn(), ["Conicity", "RFV CW"]);
  assert.equal(requests.length, count);
  assert.equal(requests.at(-1).params.sku, "SAP-01");
  await page
    .getByRole("button", { name: "Plot RFV CW", exact: true })
    .waitFor();
  assert.equal(requests.length, 3);
  assert.ok(requests.every((r) => r.path.endsWith("/gold")));
  await page.getByText("MICROPOISE", { exact: true }).click();
  await page.getByRole("button", { name: "SAP-01", exact: true }).click();
  await page
    .getByRole("button", { name: "Plot RFV CW", exact: true })
    .waitFor();
  assert.equal(
    requests.length,
    3,
    "Breadcrumb revisits cached selected levels",
  );
  await page.getByRole("button", { name: "Plot RFV CW", exact: true }).click();
  await page.getByText(/1000 of 1002 measured tyres loaded/).waitFor();
  assert.equal(requests.filter((r) => r.path.endsWith("/points")).length, 1);
  assert.equal(await page.locator(".highcharts-point").count(), 1000);
  const markerCounts = await page
    .locator(".highcharts-point")
    .evaluateAll((points) => {
      const counts = new Map();
      for (const p of points)
        counts.set(
          p.getAttribute("fill"),
          (counts.get(p.getAttribute("fill")) ?? 0) + 1,
        );
      return [...counts.values()].sort((a, b) => a - b);
    });
  assert.deepEqual(
    markerCounts,
    [200, 800],
    "Every off-spec tyre gets its own differently coloured marker",
  );
  await page.locator(".highcharts-point").nth(500).hover({ force: true });
  await page.evaluate(() =>
    window._Highcharts.charts
      .find((c) => c?.series[0]?.points.length === 1000)
      .series[0].points[500].onMouseOver(),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector(".highcharts-tooltip")
        ?.textContent.includes("Barcode: TYRE-"),
    null,
    { timeout: 5000 },
  );
  const tooltip = await page.locator(".highcharts-tooltip").textContent();
  for (const field of [
    "Barcode: TYRE-500",
    "Test time:",
    "Shift: A",
    "Value: 17",
    "Grade: C",
  ])
    assert.ok(tooltip.includes(field), field);
  await page.getByRole("button", { name: "Load next 1000 tyres" }).click();
  await page.getByText(/1002 of 1002 measured tyres loaded/).waitFor();
  assert.equal(await page.locator(".highcharts-point").count(), 1002);
  const chart = await page.locator(".highcharts-plot-background").boundingBox();
  await page.mouse.move(
    chart.x + chart.width * 0.2,
    chart.y + chart.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    chart.x + chart.width * 0.65,
    chart.y + chart.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.locator(".highcharts-reset-zoom").waitFor();
  await page.screenshot({ path: "/tmp/b-uni-raw-plot-fixture.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(
    requests.filter((r) => r.path.endsWith("/barcodes")).length,
    0,
    "Plot icon never opens barcodes",
  );
  // The whole parameter row is the target: the Failed tyres count opens it too.
  await page
    .locator("tbody tr")
    .filter({ hasText: "RFV CW" })
    .locator("td")
    .nth(1)
    .click();
  await waitFor("FAILED-0");
  assert.equal(requests.filter((r) => r.path.endsWith("/barcodes")).length, 1);
  assert.equal(requests.at(-1).params.parameter, "RFV CW");
  // expected is UI-only (parity warning): 201 Gold vs 201 Silver = no warning.
  assert.equal(await page.getByText(/Gold reports/).count(), 0);
  assert.equal(requests.at(-1).params.machine, "MICROPOISE");
  assert.equal(requests.at(-1).params.sku, "SAP-01");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await waitFor("FAILED-100");
  assert.equal(requests.filter((r) => r.path.endsWith("/barcodes")).length, 2);
  await drillCard("ZF Uniformity Yield");
  await toParameter();
  await page.getByRole("button", { name: "RFV CW", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Plot / }).count(), 0);
  await page.locator("tbody tr").filter({ hasText: "RFV CW" }).click();
  await waitFor("FAILED-0");
  assert.equal(
    await page.locator("tbody tr").first().locator("td").nth(3).innerText(),
    "",
  );
  assert.equal(
    await page.locator("tbody tr").first().locator("td").nth(5).innerText(),
    "—",
  );
  await drillCard("ZF Balancing Yield");
  await toParameter();
  await waitFor("Upper Unbalance");
  assert.equal(await page.getByRole("button", { name: /^Plot / }).count(), 0);
  await drillCard("TUO Uniformity Yield");
  await page.getByRole("button", { name: "MICROPOISE", exact: true }).click();
  await page.getByText(/TUO status\/barcode drill unavailable/).waitFor();
  await waitFor("SAP-01");
  assert.equal(
    requests.filter((r) => r.params.card === "tuo" && !r.path.endsWith("/gold"))
      .length,
    0,
  );
  assert.equal(
    requests.filter(
      (r) => r.params.card === "tuo" && r.params.level === "parameter",
    ).length,
    0,
  );
  await clickText("DBM Balancing Yield");
  await page.getByText("Fixture Uniformity outage").waitFor();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("button", { name: "MICROPOISE", exact: true }).waitFor();
  await toParameter();
  await page
    .getByRole("button", { name: "Plot Upper Unbalance", exact: true })
    .waitFor();
  await page.screenshot({ path: "/tmp/b-uni-drill-fixture.png" });
  // New period = new exact-context requests. Late old-card replies must never
  // replace the selected card's rows, even when they finish last.
  await clickText("Today");
  await waitFor("MTMS Uniformity Yield");
  delayedMtms = true;
  await clickText("MTMS Uniformity Yield");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".jk-wait-text")].some((n) =>
      n.textContent.includes("Loading Uniformity"),
    ),
  );
  await drillCard("ZF Uniformity Yield");
  await delay(850);
  assert.equal(await page.getByText("STALE-MTMS", { exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "MICROPOISE", exact: true }).count(),
    1,
  );
  emptyDbm = true;
  await clickText("DBM Balancing Yield");
  await page.getByRole("combobox").filter({ hasText: "All Shifts" }).click();
  await page.getByRole("option", { name: "Shift A", exact: true }).click();
  await clickText("DBM Balancing Yield");
  await page
    .getByText("No Gold rows for this selection.", { exact: true })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: /^Plot / }).count(), 0);
  await page.getByText("Date Range", { exact: true }).click();
  await page.getByText("Custom Date Range…", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Previous month" }).click();
  await dialog.getByText("10", { exact: true }).click();
  await dialog.getByText("12", { exact: true }).click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  const beforeInvalidScope = requests.length;
  await clickText("MTMS Uniformity Yield");
  await page.getByText(/Choose All Shifts for a month or date range/).waitFor();
  assert.equal(requests.length, beforeInvalidScope);
  await page.getByRole("button", { name: "Use All Shifts" }).click();
  delayedMtms = false;
  emptyDbm = false;
  await drillCard("DBM Balancing Yield");
  await page
    .getByText(
      /Cards show the latest snapshot; this drill covers the selected date range/,
    )
    .waitFor();
  const rangeRequest = requests.at(-1).params;
  assert.equal(rangeRequest.period, "range");
  assert.ok(rangeRequest.from.endsWith("-10"));
  assert.ok(rangeRequest.to.endsWith("-12"));
  assert.notEqual(rangeRequest.from, rangeRequest.to);
  assert.equal(rangeRequest.shift, "ALL");

  // Screenshot path: leaf family -> factual Gold machine rows -> SKU.
  await clickText("Overall Production Yield");
  const familyButton = page.getByRole("button", { name: "MTMS Uniformity ›" });
  await familyButton.waitFor();
  const overallFirst = await page
    .getByText("Overall Production Yield", { exact: true })
    .first()
    .boundingBox();
  const testedFirst = await page
    .getByText("Uniformity Tyres Tested", { exact: true })
    .first()
    .boundingBox();
  const familyTable = await page
    .locator("table[aria-label='Overall Production Yield drill-down']")
    .boundingBox();
  assert.ok(
    testedFirst.y > overallFirst.y && familyTable.x > overallFirst.x,
    "First Overall family drill uses vertical cards and right panel",
  );
  const legacyBeforeReclick = legacyRequests.length;
  await clickText("Overall Production Yield");
  await familyButton.waitFor();
  assert.equal(
    legacyRequests.length,
    legacyBeforeReclick,
    "Reclick preserves family table without fetching",
  );
  const featureBeforeFamily = requests.length;
  await familyButton.focus();
  await page.keyboard.press("Enter");
  const machineButton = page.getByRole("button", {
    name: "30-0224",
    exact: true,
  });
  await machineButton.waitFor();
  assert.equal(
    requests.length,
    featureBeforeFamily + 1,
    "Only selected machine level loaded",
  );
  const machineRequest = requests.at(-1).params;
  assert.equal(machineRequest.level, "machine");
  assert.equal(machineRequest.card, "mtms");
  assert.equal(machineRequest.period, "range");
  assert.equal(machineRequest.from, rangeRequest.from);
  assert.equal(machineRequest.to, rangeRequest.to);
  assert.equal(machineRequest.machine, undefined);
  const assertBridgedLayout = async () => {
    const card = await page
      .getByText("Overall Production Yield", { exact: true })
      .first()
      .boundingBox();
    const nextCard = await page
      .getByText("Uniformity Tyres Tested", { exact: true })
      .first()
      .boundingBox();
    const table = await page.locator("tbody tr").first().boundingBox();
    assert.ok(
      nextCard.y > card.y && table.x > card.x,
      "Overall bridged drill retains vertical cards/right-hand table",
    );
  };
  const reclickOverall = async () => {
    const before = requests.length;
    await clickText("Overall Production Yield");
    await assertBridgedLayout();
    assert.equal(
      requests.length,
      before,
      "Reclicking the same card does not refetch",
    );
  };
  await reclickOverall();
  await machineButton.waitFor();
  await sortHeader("Machine");
  await sortHeader("Machine");
  await machineButton.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "SAP-01", exact: true }).waitFor();
  await reclickOverall();
  await page.getByRole("button", { name: "SAP-01", exact: true }).waitFor();
  const skuRequest = requests.at(-1).params;
  assert.equal(skuRequest.level, "sku");
  assert.equal(skuRequest.card, "mtms");
  assert.equal(skuRequest.machine, "30-0224");
  assert.equal(skuRequest.period, "range");
  assert.equal(skuRequest.from, rangeRequest.from);
  assert.equal(skuRequest.to, rangeRequest.to);
  assert.equal(
    requests.length,
    featureBeforeFamily + 2,
    "One machine level and selected SKU level; no child preload",
  );
  await sortHeader("SKU");
  await sortHeader("SKU");
  await page.getByRole("button", { name: "SAP-01", exact: true }).click();
  await page.getByRole("button", { name: "RFV CW", exact: true }).waitFor();
  assert.equal(requests.at(-1).params.machine, "30-0224");
  await sortHeader("Failed tyres");
  await sortHeader("Failed tyres");
  const barcodeCalls = requests.filter((r) => r.path.endsWith("/barcodes"));
  assert.equal(
    requests.filter((r) => r.path.endsWith("/barcodes")).length,
    barcodeCalls.length,
    "Sorting never opens barcodes",
  );
  // Keyboard: the parameter name is a real button; one activation, one request.
  await page.getByRole("button", { name: "RFV CW", exact: true }).focus();
  await page.keyboard.press("Enter");
  await waitFor("FAILED-0");
  assert.equal(
    requests.filter((r) => r.path.endsWith("/barcodes")).length,
    barcodeCalls.length + 1,
    "Keyboard activation sends exactly one barcodes request",
  );
  await reclickOverall();
  await waitFor("FAILED-0");
  const cellValues = (index) =>
    page.locator(`tbody tr td:nth-child(${index})`).allTextContents();
  let beforeSort = requests.length;
  await sortHeader("Test time");
  assert.equal((await cellValues(1))[0], "B-10");
  await sortHeader("Test time");
  assert.equal((await cellValues(1))[0], "A-2");
  await sortHeader("Barcode");
  assert.equal((await cellValues(1))[0], "Z-1");
  await sortHeader("Barcode");
  assert.deepEqual((await cellValues(1)).slice(0, 2), ["A-2", "B-10"]);
  await sortHeader("Value");
  assert.equal((await cellValues(4))[0], "99");
  await sortHeader("Value");
  assert.equal((await cellValues(4))[0], "0");
  await sortHeader("Grade");
  assert.equal((await cellValues(5))[0], "10");
  await sortHeader("Grade");
  assert.equal((await cellValues(5))[0], "2");
  assert.equal(
    requests.length,
    beforeSort,
    "Page-local sorting makes no requests",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await waitFor("FAILED-100");
  assert.equal(requests.at(-1).params.offset, "100");
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await waitFor("FAILED-0");
  assert.equal(requests.at(-1).params.machine, "30-0224");
  assert.equal(requests.at(-1).params.parameter, "RFV CW");
  await page.getByText("SAP-01", { exact: true }).click();
  await page.getByRole("button", { name: "Plot RFV CW" }).click();
  await page.getByText(/1000 of 1002 measured tyres loaded/).waitFor();
  assert.equal(requests.at(-1).params.machine, "30-0224");
  assert.equal(requests.at(-1).params.card, "mtms");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByText("MTMS Uniformity", { exact: true }).click();
  await machineButton.waitFor();
  await page
    .getByRole("button", { name: "NEW-FACTUAL-729", exact: true })
    .click();
  await page.getByRole("button", { name: "SAP-01", exact: true }).waitFor();
  assert.equal(requests.at(-1).params.machine, "NEW-FACTUAL-729");
  await page.getByText("MTMS Uniformity", { exact: true }).click();
  await machineButton.waitFor();
  await page
    .getByText("Overall Production Yield", { exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "ZF Uniformity ›" }).waitFor();
  const overallAfterBack = await page
    .getByText("Overall Production Yield", { exact: true })
    .first()
    .boundingBox();
  const testedAfterBack = await page
    .getByText("Uniformity Tyres Tested", { exact: true })
    .first()
    .boundingBox();
  assert.ok(
    testedAfterBack.y > overallAfterBack.y,
    "Family panel remains open in the right-hand drill layout",
  );
  await page.getByRole("button", { name: "ZF Uniformity ›" }).click();
  await page.getByRole("button", { name: "ZF-01", exact: true }).waitFor();
  assert.ok(
    legacyRequests.every(
      (request) =>
        request.kpi_names === "Mtms_Uniformity_Yield,Zf_Uniformity_Yield",
    ),
  );
  assert.equal(requests.at(-1).params.level, "machine");
  assert.equal(requests.at(-1).params.card, "zf-uniformity");
  await page.getByRole("button", { name: "ZF-01", exact: true }).click();
  await page.getByRole("button", { name: "SAP-01", exact: true }).waitFor();
  assert.equal(requests.at(-1).params.card, "zf-uniformity");
  assert.equal(requests.at(-1).params.machine, "ZF-01");
  assert.equal(requests.at(-1).params.level, "sku");
  await clickText("TUO Uniformity Yield");
  await page.getByRole("button", { name: "MICROPOISE", exact: true }).waitFor();
  assert.equal(requests.at(-1).params.card, "tuo");
  await page.getByRole("button", { name: "Close Uniformity drill" }).click();
  assert.equal(await page.locator("tbody tr").count(), 0);
  const overallAfterClose = await page
    .getByText("Overall Production Yield", { exact: true })
    .first()
    .boundingBox();
  const testedAfterClose = await page
    .getByText("Uniformity Tyres Tested", { exact: true })
    .first()
    .boundingBox();
  assert.ok(
    Math.abs(overallAfterClose.y - testedAfterClose.y) < 5,
    "Closing restores the normal card grid",
  );
  await clickText("Uniformity Tyres Tested");
  await page.getByText("MT-01", { exact: true }).waitFor();
  let cardBox = await page
    .getByText("Uniformity Tyres Tested", { exact: true })
    .first()
    .boundingBox();
  let siblingBox = await page
    .getByText("Overall Production Yield", { exact: true })
    .first()
    .boundingBox();
  let panelBox = await page
    .locator("table[aria-label='Uniformity Tyres Tested drill-down']")
    .boundingBox();
  assert.ok(
    cardBox.y > siblingBox.y && panelBox.x > cardBox.x,
    "Legacy tested drill opens right on first click",
  );
  // Error path first: the API layer caches successful responses.
  paintFail = true;
  await clickText("GT Weight Variation");
  await page
    .getByText("Unable to load paint weight data.", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".jk-wait-text").count(), 0);
  assert.equal(await page.locator(".MuiCircularProgress-root").count(), 0);
  paintFail = false;
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await clickText("GT Weight Variation");
  await page
    .getByText("GT Weight Variation — Paint Weight", { exact: true })
    .waitFor();
  // Delayed mock: branded loader must be visible, then clear on data.
  await page
    .locator(".jk-wait-text", { hasText: "Loading paint weight data" })
    .waitFor();
  assert.equal(await page.locator(".MuiCircularProgress-root").count(), 0);
  await page
    .getByText("No SKU data for this period.", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".jk-wait-text").count(), 0);
  panelBox = await page
    .getByText("GT Weight Variation — Paint Weight", { exact: true })
    .boundingBox();
  cardBox = await page
    .getByText("GT Weight Variation", { exact: true })
    .first()
    .boundingBox();
  assert.ok(
    panelBox.x > cardBox.x,
    "Other Product drill opens right on first click",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 700, height: 1100 });
  await clickText("Overall Production Yield");
  await page.getByRole("button", { name: "MTMS Uniformity ›" }).waitFor();
  let lastCard = await page
    .getByText("CTA Compliance", { exact: true })
    .first()
    .boundingBox();
  panelBox = await page
    .locator("table[aria-label='Overall Production Yield drill-down']")
    .boundingBox();
  assert.ok(
    panelBox.y > lastCard.y,
    "Narrow viewport stacks family drill below cards",
  );
  await page.getByRole("button", { name: "MTMS Uniformity ›" }).click();
  await page.getByRole("button", { name: "30-0224", exact: true }).waitFor();
  lastCard = await page
    .getByText("CTA Compliance", { exact: true })
    .first()
    .boundingBox();
  panelBox = await page.locator("tbody tr").first().boundingBox();
  assert.ok(
    panelBox.y > lastCard.y,
    "Narrow viewport stacks machine drill below cards",
  );
  await page.getByRole("button", { name: "Close Uniformity drill" }).click();
  // --- Technical trend wiring (placed last: drills above assert request counts).
  await page.setViewportSize({ width: 1520, height: 1100 });
  await waitFor("MTMS Uniformity Yield");
  // Technical trend wiring: Gold trend modal, lazy, supported cards only.
  const trendButtons = page.getByRole("button", {
    name: "View Trend Analytics",
  });
  const silverBefore = requests.length;
  trendRequests.length = 0; // Quality page trend clicks are not Technical.
  await delay(300);
  assert.equal(trendRequests.length, 0, "No trend preload");
  assert.equal(
    await trendButtons.count(),
    7,
    "Only the seven Uniformity cards expose a trend action",
  );
  for (const [index, kpi, title] of [
    [0, "Overall_Production_Yield", "Overall Production Yield"],
    [2, "Mtms_Uniformity_Yield", "MTMS Uniformity Yield"],
    [5, "Zf_Balancing_Yield_o", "ZF Balancing Yield"],
    [6, "Dbm_Balancing_Yield", "DBM Balancing Yield"],
  ]) {
    const before = trendRequests.length;
    await trendButtons.nth(index).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await delay(300);
    assert.ok(trendRequests.length > before, `${kpi} requests Gold trend`);
    assert.equal(trendRequests[before].kpi_names, kpi);
    assert.equal(trendRequests[before].rows, "plant");
    assert.ok(
      (await dialog.textContent()).includes(title),
      `${title} modal title`,
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await trendButtons.first().waitFor();
  }
  assert.equal(
    requests.length,
    silverBefore,
    "Trend never calls Silver drill endpoints",
  );
  // Drill <-> trend precedence (card behind the modal is clicked by event).
  await drillCard("MTMS Uniformity Yield");
  await trendButtons.nth(2).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page.getByRole("button", { name: "MICROPOISE", exact: true }).count(),
    0,
    "Opening trend closes the drill",
  );
  await (await text("ZF Uniformity Yield")).dispatchEvent("click");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "MICROPOISE", exact: true }).waitFor();
  await page.getByRole("button", { name: "Close Uniformity drill" }).click();
  // Branded loader only: no generic spinner in any drill; loader clears after data/error.
  const loaders = await page.evaluate(() => ({
    jk: [...window.__loaders.jk],
    spinner: window.__loaders.spinner,
    where: window.__loaders.where,
  }));
  assert.equal(loaders.spinner, 0, JSON.stringify(loaders.where));
  assert.ok(
    loaders.jk.some((m) => m.startsWith("Loading Uniformity")),
    JSON.stringify(loaders.jk),
  );
  assert.equal(await page.locator(".jk-wait-text").count(), 0);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  await delay(50);
  console.info(
    JSON.stringify(
      {
        result: "PASS",
        validation: "mocked API only; no production data",
        requests: requests.length,
        rawRequests: requests.filter((r) => !r.path.endsWith("/gold")),
        browserErrors: errors,
        screenshots: [
          "/tmp/b-uni-raw-plot-fixture.png",
          "/tmp/b-uni-drill-fixture.png",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({ path: "/tmp/b-uni-browser-failure.png" });
  console.error(
    JSON.stringify({
      browserErrors: errors,
      diagnostics: await page.evaluate(() => ({
        highcharts: (window._Highcharts?.charts ?? [])
          .filter(Boolean)
          .map((c) => ({
            enabled: c.options.tooltip.enabled,
            mouseTracking: c.series[0].options.enableMouseTracking,
            tooltipCreated: !!c.tooltip,
          })),
        tooltip: [...document.querySelectorAll(".highcharts-tooltip")].map(
          (e) => e.outerHTML,
        ),
        point: document.querySelector(".highcharts-point")?.outerHTML,
      })),
      pageText: await page.locator("body").innerText(),
    }),
  );
  throw error;
} finally {
  await browser.close();
  await vite.close();
}
