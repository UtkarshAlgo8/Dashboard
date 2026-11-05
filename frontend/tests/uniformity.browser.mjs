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
  emptyDbm = false;
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
              ];
      } else if (level === "sku") {
        assert.equal(q.get("machine"), "MICROPOISE");
        all = [{ sku: "SAP-01", yield_pct: 92.5, tyres_tested: 1002 }];
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
          barcode: `FAILED-${n}`,
          test_time: "2026-11-01 08:00:00",
          shift: "A",
          actual_value: card.startsWith("zf") ? null : n,
          grade: "C",
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
  if (url.pathname.endsWith("/product/summary"))
    return respond(route, { data: { values } });
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
  await drillCard("MTMS Uniformity Yield");
  await toParameter();
  await page
    .getByRole("button", { name: "Plot RFV CW", exact: true })
    .waitFor();
  assert.equal(requests.length, 3);
  assert.ok(requests.every((r) => r.path.endsWith("/gold")));
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
  await page.getByRole("button", { name: "201", exact: true }).click();
  await waitFor("FAILED-0");
  assert.equal(requests.filter((r) => r.path.endsWith("/barcodes")).length, 1);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await waitFor("FAILED-100");
  assert.equal(requests.filter((r) => r.path.endsWith("/barcodes")).length, 2);
  await drillCard("ZF Uniformity Yield");
  await toParameter();
  await page.getByRole("button", { name: "201", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Plot / }).count(), 0);
  await page.getByRole("button", { name: "201", exact: true }).click();
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
  await page.waitForFunction(
    () => !!document.querySelector('[aria-label="Loading Uniformity table"]'),
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
  await page
    .getByText("No Gold rows for this selection.", { exact: true })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: /^Plot / }).count(), 0);
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
        highcharts: window._Highcharts.charts.filter(Boolean).map((c) => ({
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
