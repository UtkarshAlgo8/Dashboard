/* global process, Buffer */
/** Offline browser contract. All API responses are intercepted; no production calls. */
import assert from "node:assert/strict";
import { createServer } from "vite";
import { toSpcWorkspace } from "../../backend/src/quality/ctp/spc.transform.js";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
process.env.VITE_API_BASE_URL = "/api/v1";
const PORT = 5193;
const vite = await createServer({
  root: new URL("../", import.meta.url).pathname,
  cacheDir: "/tmp/ctp-spc-browser-vite-cache",
  server: { host: "127.0.0.1", port: PORT, strictPort: true },
});
await vite.listen();
const origin = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 1050 } });
await page.clock.setFixedTime(new Date("2026-11-11T08:00:00Z"));
const DAY = "2026-11-10";
const errors = [],
  calls = [];
const fixture = (params) => {
  const date = params.date ?? DAY;
  const rows = [];
  if (date !== "2026-11-09") {
    for (const [tyre, machine, parameter] of [
      ["PCR", "PCR TRENCH 1", "HP Steam Pressure"],
      ["PCR", "PCR TRENCH 1", "Nitrogen Pressure"],
      ["TBR", "TBR TRENCH 2", "HP Steam Temperature"],
    ]) {
      for (const metric of [
        "Cp",
        "Cpk",
        "Pp",
        "Ppk",
        "Mean",
        "OOC Points",
        "Shift Stats",
      ]) {
        const capability = ["Cp", "Cpk", "Pp", "Ppk"].includes(metric);
        const points = Array.from({ length: 18 }, (_, i) => ({
          t: `${date} 13:${String(i).padStart(2, "0")}`,
          shift: i < 12 ? "A" : "B",
          x_bar: i === 0 ? 14 : 10.2 + i / 100,
          r: 0.3 + i / 100,
          ooc: i === 0,
        }));
        rows.push({
          record_id: String(rows.length + 1),
          date,
          tyre_type: tyre,
          machine,
          itemcode: "ALL",
          section: "Curing",
          product_type: parameter,
          granularity:
            metric === "Shift Stats" ? `SHIFT ${params.shift ?? "All"}` : "Day",
          kpi_name: `${parameter} ${metric}`,
          unit_of_measurement: "kg/cm2",
          actual_value: capability
            ? metric === "Cpk"
              ? "0.3264"
              : "1.422"
            : metric === "OOC Points"
              ? "1"
              : metric === "Shift Stats"
                ? "24"
                : "10.25",
          status:
            metric === "Cpk"
              ? "Critical"
              : capability
                ? "Warning"
                : metric === "OOC Points"
                  ? "Out of Control"
                  : "Within Spec",
          plot_data: JSON.stringify(
            capability
              ? { window_days: metric.startsWith("P") ? 90 : 30 }
              : metric === "OOC Points"
                ? { UCL: 13, CL: 10, LCL: 7, USL: 12, LSL: 8, points }
                : { n: 216, target: 10 },
          ),
        });
      }
    }
  }
  return {
    ...toSpcWorkspace(rows, {
      tyre: params.tyre ?? "All",
      shift: params.shift ?? "All",
      date: params.date ?? null,
    }),
    fetched_at: "2026-11-11T08:00:00Z",
  };
};
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  if (!url.pathname.startsWith("/api/v1/")) return route.continue();
  const params = Object.fromEntries(url.searchParams);
  calls.push({ path: url.pathname, params });
  let data = {};
  if (url.pathname.endsWith("/auth/current-user"))
    data = { user: { id: 1, username: "Fixture", role: "admin", roles: [] } };
  if (
    url.pathname.includes("/quality/ctp/process/") ||
    url.pathname.includes("/quality/ctp/product/")
  )
    data = { cards: [], drills: {} };
  if (url.pathname.endsWith("/quality/ctp/spc/workspace")) {
    if (params.date === "2026-11-08")
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Fixture source unavailable" },
        }),
      });
    if (params.date === "2026-11-07")
      await new Promise((resolve) => setTimeout(resolve, 600));
    data = fixture(params);
  }
  await route.fulfill({
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
const workspace = () => page.getByRole("region", { name: "CTP SPC workspace" });
const spcCalls = () =>
  calls.filter((call) => call.path.endsWith("/spc/workspace"));
const choose = async (label, option) => {
  await workspace().getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};
const dateInput = () => page.locator('input[type="date"]');
const waitPublished = () =>
  workspace()
    .getByText(/Published data: 2026-11-10/)
    .waitFor();

try {
  await page.goto(`${origin}/chennai/quality`);
  await page.getByText("SPC", { exact: true }).click();
  await waitPublished();
  assert.equal(spcCalls().at(-1).params.date, undefined);
  await page.getByText("Today", { exact: true }).click();
  await workspace()
    .getByText(/Published data: 2026-11-11/)
    .waitFor();
  assert.equal(spcCalls().at(-1).params.date, "2026-11-11");
  await workspace()
    .getByRole("button", { name: "Latest published", exact: true })
    .click();
  await waitPublished();
  assert.equal(await page.getByText("This Month", { exact: true }).count(), 0);
  assert.equal(await page.getByText("This Year", { exact: true }).count(), 0);
  assert.equal(
    await workspace()
      .getByRole("combobox", { name: "Machine", exact: true })
      .textContent(),
    "PCR TRENCH 1 (PCR)",
  );
  await workspace()
    .getByText("30-day window", { exact: false })
    .first()
    .waitFor();
  const xChart = () =>
    workspace().getByRole("group", { name: /^X̄ control chart/ });
  const rangeChart = () =>
    workspace().getByRole("group", { name: /^Range readings/ });
  assert.equal(await xChart().locator("circle").count(), 18);
  assert.equal(await rangeChart().locator("circle").count(), 18);
  await page.keyboard.press("Tab");
  await xChart().locator("circle").first().focus();
  await page.getByRole("tooltip").getByText("Nelson rules: 1").waitFor();
  await page.keyboard.press("Escape");
  await workspace()
    .getByRole("button", { name: "Rule 2", exact: true })
    .click();
  assert.equal(
    await workspace()
      .getByRole("button", { name: "Rule 2", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.ok((await xChart().locator('circle[r="7"]').count()) >= 9);
  await workspace()
    .getByRole("button", { name: "Rule 2", exact: true })
    .click();
  assert.equal(await xChart().locator('circle[r="7"]').count(), 0);
  await choose("Parameter", "Nitrogen Pressure");
  assert.match(await xChart().getAttribute("aria-label"), /Nitrogen Pressure/);
  await choose("Machine", "TBR TRENCH 2 (TBR)");
  assert.match(await xChart().getAttribute("aria-label"), /TBR TRENCH 2/);
  const before = spcCalls().length;
  await workspace()
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await waitPublished();
  assert.equal(spcCalls().length, before + 1);
  assert.equal(spcCalls().at(-1).params.refresh, "1");
  assert.match(await xChart().getAttribute("aria-label"), /TBR TRENCH 2/);
  // Header tyre/shift filters must actually scope the request.
  await page.getByText("PCR", { exact: true }).click();
  await waitPublished();
  assert.equal(spcCalls().at(-1).params.tyre, "PCR");
  await page.getByRole("combobox").filter({ hasText: "All Shifts" }).click();
  await page.getByRole("option", { name: "Shift A", exact: true }).click();
  await workspace()
    .getByText(/Published Shift A sample count: 24/)
    .waitFor();
  assert.equal(spcCalls().at(-1).params.shift, "A");
  assert.equal(await xChart().locator("circle").count(), 12);
  await page.getByRole("combobox").filter({ hasText: "Shift A" }).click();
  await page.getByRole("option", { name: "Shift C", exact: true }).click();
  await workspace()
    .getByText("No X̄ readings for this selection.", { exact: true })
    .waitFor();
  await workspace()
    .getByText("No rule assessment available for this selection.", {
      exact: true,
    })
    .waitFor();
  // Exact-day empty and failure never leave the previous chart visible.
  await dateInput().fill("2026-11-09");
  await workspace()
    .getByText(/Older data is not substituted automatically/)
    .waitFor();
  assert.equal(await workspace().getByRole("group", { name: /^X̄/ }).count(), 0);
  await dateInput().fill("2026-11-08");
  await workspace()
    .getByText(/Could not load CTP SPC: Fixture source unavailable/)
    .waitFor();
  assert.equal(
    await workspace()
      .getByText(/No SPC data for this tyre/)
      .count(),
    0,
  );
  // A slow, outdated response must not overwrite a newer selected day.
  await dateInput().fill("2026-11-07");
  await workspace().getByText("Loading SPC data", { exact: true }).waitFor();
  await dateInput().fill("2026-11-09");
  await workspace()
    .getByText(/Older data is not substituted automatically/)
    .waitFor();
  await page.waitForTimeout(700);
  assert.equal(
    await workspace()
      .getByRole("combobox", { name: "Machine", exact: true })
      .count(),
    0,
  );
  await workspace()
    .getByRole("button", { name: "Latest published", exact: true })
    .click();
  await waitPublished();
  // Restore all shifts and confirm table CSV export remains usable.
  await page.getByRole("combobox").filter({ hasText: "Shift C" }).click();
  await page.getByRole("option", { name: "All Shifts", exact: true }).click();
  await waitPublished();
  const rulesCard = workspace()
    .locator("div")
    .filter({ has: page.getByText("Nelson rule violations", { exact: true }) })
    .filter({ has: page.locator("table") })
    .last();
  const downloadPromise = page.waitForEvent("download");
  await rulesCard.getByTitle("Download", { exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.csv$/);
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk;
  assert.match(csv, /9 consecutive points/);
  const chartCard = workspace()
    .locator("div")
    .filter({ has: page.getByText("X̄ control chart", { exact: true }) })
    .filter({ has: page.getByRole("group", { name: /^X̄ control chart/ }) })
    .last();
  const [png] = await Promise.all([
    page.waitForEvent("download"),
    chartCard.getByTitle("Download", { exact: true }).click(),
  ]);
  assert.match(png.suggestedFilename(), /\.png$/);
  const pngStream = await png.createReadStream();
  const chunks = [];
  for await (const chunk of pngStream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).subarray(1, 4).toString(), "PNG");
  await page.screenshot({ path: "/tmp/ctp-spc-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await workspace()
    .getByRole("combobox", { name: "Machine", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/ctp-spc-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1480, height: 1050 });
  await page.getByText("Process", { exact: true }).click();
  await page.getByText("SPC", { exact: true }).waitFor();
  assert.equal(await page.getByText("This Month", { exact: true }).count(), 1);
  assert.equal(await workspace().count(), 0);
  await page.getByText("Product", { exact: true }).click();
  assert.equal(await workspace().count(), 0);
  assert.equal(
    calls.some((call) => /\/quality\/spc\//.test(call.path)),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "CTP SPC browser checks passed: selectors, scope, rules, focus tooltip, refresh, empty/error/stale states, CSV, mobile, existing tabs.",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/ctp-spc-browser-failure.png",
    fullPage: true,
  });
  console.error(
    await page.locator('[role="combobox"]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        text: node.textContent,
        label: node.getAttribute("aria-labelledby"),
        html: node.outerHTML.slice(0, 700),
      })),
    ),
  );
  throw error;
} finally {
  await browser.close();
  await vite.close();
}
