/* global process */
/** Mock-only Engineering Breakdown trend tooltip regression. */
import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
process.env.VITE_API_BASE_URL = "/api/v1";
const vite = await createServer({
  root: new URL("../", import.meta.url).pathname,
  cacheDir: "/tmp/btp-breakdown-tooltip-vite-cache",
  server: { host: "127.0.0.1", port: 5184, strictPort: true },
});
await vite.listen();
const origin = "http://127.0.0.1:5184";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1520, height: 1100 } });
const errors = [],
  calls = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.origin !== origin) return route.abort();
  if (!u.pathname.startsWith("/api/v1/")) return route.continue();
  calls.push(u.pathname);
  let data = { values: {}, rows: [], points: [], series: {} };
  if (u.pathname.endsWith("/auth/current-user"))
    data = {
      user: {
        id: 1,
        username: "Fixture",
        fullName: "Fixture",
        email: "qa@example.test",
        role: "admin",
        roles: [],
      },
    };
  if (u.pathname.endsWith("/plants/banmore"))
    data = { id: "banmore", name: "Banmore", shortName: "BTP", enabled: true };
  if (u.pathname.endsWith("/as-of")) data = { asOf: "2026-11-09" };
  if (u.pathname.endsWith("/engineering/reliability/summary"))
    data = {
      values: {
        Breakdown_Pct_Overall: 5.5,
        BreakdownMin_Overall: 300,
        MTBF_Overall: 20,
        MTTR_Overall: 1,
      },
    };
  if (u.pathname.endsWith("/engineering/reliability/kpi-children")) {
    const failure = (u.searchParams.get("kpi_names") ?? "").includes(
      "_Failure",
    );
    data = {
      rows: failure
        ? [
            {
              machine: "M01",
              eqname: "Fixture machine",
              section: "Curing",
              status: "C",
              remarks: "Motor failure",
              sub_section: "Mechanical",
              BreakdownMin_m_Failure: 100,
              BreakdownOcc_m_Failure: 5,
              Breakdown_Pct_m_Failure: 11.46,
            },
            {
              machine: "M02",
              eqname: "Second machine",
              section: "Curing",
              status: "C",
              remarks: "Sensor failure",
              sub_section: "Electrical",
              BreakdownMin_m_Failure: 50,
              BreakdownOcc_m_Failure: 2,
              Breakdown_Pct_m_Failure: 5,
            },
          ]
        : [
            {
              machine: "M01",
              eqname: "Fixture machine",
              section: "Curing",
              status: "C",
              BreakdownMin_m: 100,
              BreakdownOcc_m: 5,
              Breakdown_Pct_m: 11.46,
            },
            {
              machine: "M02",
              eqname: "Second machine",
              section: "Curing",
              status: "C",
              BreakdownMin_m: 50,
              BreakdownOcc_m: 2,
              Breakdown_Pct_m: 5,
            },
          ],
    };
  }
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
});
await page.addInitScript(() => {
  localStorage.setItem("jkdash.accessToken", "fixture-only");
  localStorage.setItem(
    "jkdash.user",
    JSON.stringify({ id: 1, username: "Fixture", role: "admin" }),
  );
});
async function tooltipState() {
  return page
    .locator(".highcharts-tooltip-container")
    .last()
    .evaluate((container) => {
      const box = container.querySelector(".highcharts-label-box");
      const span = container.querySelector(".highcharts-tooltip span");
      return {
        text: container.textContent,
        zIndex: getComputedStyle(container).zIndex,
        fill: box?.getAttribute("fill"),
        lineHeight: span ? getComputedStyle(span).lineHeight : null,
        opacity: getComputedStyle(container).opacity,
      };
    });
}
try {
  await page.goto(`${origin}/banmore/engineering`);
  await page.getByText("Reliability", { exact: true }).first().click();
  const card = page
    .getByText("Breakdown", { exact: true })
    .first()
    .locator("xpath=../..");
  await card.getByTitle("Trend").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/DOWNTIME \(MIN\) BY MACHINE/i).waitFor();
  const bar = dialog.locator(".highcharts-series-0 .highcharts-point").first();
  await bar.waitFor();
  // Let the dialog and Highcharts opening animations settle before capture.
  await page.waitForTimeout(600);
  await bar.hover({ force: true });
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".highcharts-tooltip-container")].some((e) =>
      e.textContent.includes("Fixture machine"),
    ),
  );
  let tip = await tooltipState();
  for (const field of [
    "M01",
    "Fixture machine",
    "Curing",
    "Downtime",
    "Occurrences",
    "Breakdown %",
    "Share of scope",
    "Cumulative of displayed total",
    "Click to drill down",
  ])
    assert.ok(tip.text.includes(field), field);
  assert.equal(tip.fill.toLowerCase(), "#ffffff");
  assert.ok(Number(tip.zIndex) > 1300);
  assert.equal(tip.opacity, "1");
  assert.ok(parseFloat(tip.lineHeight) > 12);
  await page.screenshot({ path: "/tmp/btp-breakdown-tooltip-machine.png" });
  // Hover the cumulative line too; shared tooltip retains all information.
  await dialog
    .locator(".highcharts-series-1 .highcharts-point")
    .first()
    .hover({ force: true });
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".highcharts-tooltip-container")].some((e) =>
      e.textContent.includes("Cumulative of displayed total"),
    ),
  );
  await dialog.getByRole("button", { name: "Failure", exact: true }).click();
  await dialog.getByText(/DOWNTIME \(MIN\) BY FAILURE/i).waitFor();
  await dialog
    .locator(".highcharts-series-0 .highcharts-point")
    .first()
    .hover({ force: true });
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".highcharts-tooltip-container")].some((e) =>
      e.textContent.includes("Motor failure"),
    ),
  );
  tip = await tooltipState();
  assert.equal(tip.fill.toLowerCase(), "#ffffff");
  assert.ok(Number(tip.zIndex) > 1300);
  assert.ok(tip.text.includes("Downtime") && tip.text.includes("Occurrences"));
  await page.screenshot({ path: "/tmp/btp-breakdown-tooltip-failure.png" });
  await dialog
    .getByRole("button", { name: "Occurrences", exact: true })
    .click();
  await dialog.getByText(/OCCURRENCES BY FAILURE/i).waitFor();
  await dialog
    .locator(".highcharts-series-0 .highcharts-point")
    .first()
    .click({ force: true });
  await dialog.getByRole("button", { name: /Back/i }).waitFor();
  await dialog
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await page
    .locator(".highcharts-tooltip-container")
    .last()
    .waitFor({ state: "detached" });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.info(
    JSON.stringify(
      {
        result: "PASS",
        validation: "mock APIs only",
        calls: calls.length,
        browserErrors: errors,
        screenshots: [
          "/tmp/btp-breakdown-tooltip-machine.png",
          "/tmp/btp-breakdown-tooltip-failure.png",
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/btp-breakdown-tooltip-failure-debug.png",
  });
  console.error(
    JSON.stringify({
      errors,
      text: await page.locator("body").innerText(),
      calls,
    }),
  );
  throw error;
} finally {
  await browser.close();
  await vite.close();
}
