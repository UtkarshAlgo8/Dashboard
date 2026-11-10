/* global process */
/** Focused mock-only browser contract: no external requests, secrets or live data. */
import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
process.env.VITE_API_BASE_URL = "/api/v1";
const vite = await createServer({
  root: new URL("../", import.meta.url).pathname,
  cacheDir: "/tmp/btp-safety-browser-vite-cache",
  server: { host: "127.0.0.1", port: 5187, strictPort: true },
});
await vite.listen();
const origin = "http://127.0.0.1:5187";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1520, height: 1100 } });
await page.clock.setFixedTime(new Date("2026-11-06T08:00:00Z"));
const TYPE = "New ' type & <b>条件</b>";
const DETAILS =
  "#38 | <script>window.__safetyInjected=true</script>\n literal | By Fixture";
const calls = [],
  errors = [];
let delayReports = false;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.origin !== origin) return route.abort();
  if (!u.pathname.startsWith("/api/v1/")) return route.continue();
  const params = Object.fromEntries(u.searchParams);
  calls.push({ path: u.pathname, params });
  let data = { values: {}, rows: [], points: [], series: {} };
  if (u.pathname.endsWith("/auth/current-user"))
    data = { user: { id: 1, username: "Fixture", role: "admin", roles: [] } };
  if (u.pathname.endsWith("/plants/banmore"))
    data = { id: "banmore", name: "Banmore", shortName: "BTP", enabled: true };
  if (u.pathname.endsWith("/compliance"))
    data = {
      context: {
        date: params.date,
        granularity: params.granularity,
        level: params.level,
        ...(params.section ? { section: params.section } : {}),
      },
      kpis: Object.fromEntries(
        params.kpis.split(",").map((id) => [
          id,
          {
            value: id === "pm" ? 87.65 : 12.34,
            counts: {},
            rows:
              params.level === "section"
                ? [
                    {
                      section: "Mixing",
                      machine: null,
                      value: 70,
                      counts: {},
                    },
                  ]
                : [],
          },
        ]),
      ),
    };
  if (u.pathname.endsWith("/engineering/safety")) {
    if (params.date === "2026-09-01")
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Fixture source parity failure" },
        }),
      });
    const level = params.level ?? "overall",
      offset = Number(params.offset ?? 0),
      limit = Number(params.limit ?? 25);
    const empty = params.date === "2026-10-01";
    const total = empty
      ? 0
      : level === "types"
        ? 3
        : level === "reports"
          ? params.type === "Zero observations"
            ? 0
            : params.type === TYPE
              ? 27
              : 3
          : 0;
    const rows = empty
      ? []
      : level === "types"
        ? [
            { type: TYPE, value: 27 },
            { type: "Second dynamic", value: 3 },
            { type: "Zero observations", value: 0 },
          ].slice(offset, offset + limit)
        : level === "reports"
          ? Array.from(
              { length: Math.min(limit, Math.max(0, total - offset)) },
              (_, i) => ({
                date: params.date ?? params.from,
                shift: params.granularity.startsWith("SHIFT ")
                  ? params.granularity.slice(-1)
                  : null,
                section: "Mixing",
                machine: "Machine & <x>",
                status: "Escalated",
                remarks: DETAILS,
                record_id: String(offset + i + 1),
              }),
            )
          : [];
    data = {
      context: { ...params, plant: "Banmore", level, offset, limit },
      value: empty ? null : 30,
      totals: {
        overall: empty ? null : 30,
        types: empty ? null : 30,
        reports: empty ? null : 30,
        selectedType: level === "reports" ? total : null,
      },
      rows,
      page: { offset, limit, total, hasMore: offset + rows.length < total },
    };
    if (params.date === "2026-08-01") data.context.date = "2026-07-01";
    await new Promise((r) =>
      setTimeout(r, delayReports && level === "reports" ? 600 : 130),
    );
  }
  try {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  } catch (error) {
    if (!route.request().failure()) throw error;
  }
});
await page.addInitScript(() => {
  localStorage.setItem("jkdash.accessToken", "fixture-only");
  localStorage.setItem(
    "jkdash.user",
    JSON.stringify({ id: 1, username: "Fixture", role: "admin" }),
  );
});
const safetyCalls = () =>
  calls.filter((call) => call.path.endsWith("/engineering/safety"));
const panel = () =>
  page.getByRole("region", { name: "Safety Observations drill" });
const card = () =>
  page
    .locator('[role="button"][aria-expanded]')
    .filter({ has: page.getByText("Safety Observations", { exact: true }) });
const selectMonth = async (label, trigger = "Date Range") => {
  await page.getByRole("banner").getByText(trigger, { exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
};
try {
  await page.goto(`${origin}/banmore/engineering`);
  await page.getByText("Maintenance", { exact: true }).first().click();
  await card()
    .getByText("Loading Safety Observations", { exact: true })
    .waitFor();
  await card().getByText("30", { exact: true }).waitFor();
  assert.ok(safetyCalls().every((c) => c.params.level === "overall"));
  assert.equal(await card().getByText("NOS", { exact: true }).count(), 1);
  assert.equal(
    await card()
      .getByLabel(/trend|colour/i)
      .count(),
    0,
  );
  assert.equal(
    await card()
      .getByText(/Target/)
      .count(),
    0,
  );
  await page.getByText("87.65%", { exact: true }).waitFor();
  await page.getByText("12.34%", { exact: true }).waitFor();
  await card().focus();
  await page.keyboard.press("Enter");
  await panel()
    .getByText("Loading observation types", { exact: true })
    .waitFor();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  assert.equal(
    safetyCalls().filter((c) => c.params.level === "reports").length,
    0,
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished),
    ),
  );
  const cards = await page.locator('[role="button"][aria-expanded]').all();
  const boxes = await Promise.all(cards.map((c) => c.boundingBox()));
  assert.equal(boxes.length, 3);
  assert.ok(
    boxes[0].x === boxes[1].x &&
      boxes[1].x === boxes[2].x &&
      boxes[0].y < boxes[1].y &&
      boxes[1].y < boxes[2].y,
  );
  const right = await panel().boundingBox();
  assert.ok(
    right.x > boxes[2].x + boxes[2].width,
    JSON.stringify({ right, boxes }),
  );
  const typeRow = panel()
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: TYPE, exact: true }) });
  await typeRow.focus();
  await page.keyboard.press("Enter");
  await panel()
    .getByText("Loading observation reports", { exact: true })
    .waitFor();
  await panel().getByText("1–25 of 27 reports", { exact: true }).waitFor();
  assert.deepEqual(await panel().getByRole("columnheader").allTextContents(), [
    "Date",
    "Shift",
    "Department",
    "Location",
    "Status",
    "Details",
  ]);
  assert.equal(
    await panel()
      .getByRole("cell", { name: "2026-11-01", exact: true })
      .count(),
    25,
  );
  assert.equal(
    await panel().getByRole("cell", { name: "—", exact: true }).count(),
    25,
  );
  assert.equal(
    await panel().getByRole("cell", { name: DETAILS, exact: true }).count(),
    25,
  );
  assert.equal(await page.evaluate(() => window.__safetyInjected), undefined);
  assert.equal(safetyCalls().at(-1).params.type, TYPE);
  await panel().getByRole("button", { name: "Next", exact: true }).click();
  await panel().getByText("26–27 of 27 reports", { exact: true }).waitFor();
  assert.equal(safetyCalls().at(-1).params.offset, "25");
  await panel().getByRole("button", { name: "Back to types" }).click();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  await panel()
    .getByRole("cell", { name: "Zero observations", exact: true })
    .click();
  await panel()
    .getByText("No reports for this type and period.", { exact: true })
    .waitFor();
  assert.equal(await panel().getByRole("alert").count(), 0);
  await panel().getByRole("button", { name: "Banmore · Types" }).click();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  // Closing/replacing the panel never preloads reports; PM retains its own published values.
  await page
    .getByRole("button", { name: "Open PM Compliance drill-down", exact: true })
    .click();
  assert.equal(await panel().count(), 0);
  await page
    .getByRole("region", { name: "PM Compliance drill" })
    .getByText("Mixing", { exact: true })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Open Safety Observations drill-down",
      exact: true,
    })
    .click();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  // Scope changes cancel/ignore pending reports, reset type/page, and cannot restore old rows.
  delayReports = true;
  await panel().getByRole("cell", { name: TYPE, exact: true }).click();
  await panel()
    .getByText("Loading observation reports", { exact: true })
    .waitFor();
  await selectMonth("Oct 2026");
  await panel()
    .getByText("No published observation types for this period.", {
      exact: true,
    })
    .waitFor();
  await card()
    .getByText("No published data for this period", { exact: true })
    .waitFor();
  assert.equal(await panel().getByRole("cell").count(), 0);
  assert.equal(
    await panel()
      .getByText(/Reports/)
      .count(),
    0,
  );
  delayReports = false;
  await selectMonth("Sep 2026", "Oct 2026");
  await panel()
    .getByText(/Safety unavailable: Fixture source parity failure/)
    .waitFor();
  assert.equal(
    await panel()
      .getByText(/No reports|No published/)
      .count(),
    0,
  );
  await selectMonth("Aug 2026", "Sep 2026");
  await panel()
    .getByText(
      /Safety unavailable: Safety returned missing data or a different selected scope/,
    )
    .waitFor();
  await page.getByText("Today", { exact: true }).click();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  await page.getByRole("combobox").filter({ hasText: "All Shifts" }).click();
  await page.getByRole("option", { name: "Shift B", exact: true }).click();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  await panel().getByRole("cell", { name: TYPE, exact: true }).click();
  await panel().getByText("1–25 of 27 reports", { exact: true }).waitFor();
  assert.equal(
    await panel().getByRole("cell", { name: "B", exact: true }).count(),
    25,
  );
  assert.equal(safetyCalls().at(-1).params.granularity, "SHIFT B");
  await page.getByRole("combobox").filter({ hasText: "Shift B" }).click();
  await page.getByRole("option", { name: "All Shifts", exact: true }).click();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  // Genuine arbitrary range: compliance explanation remains, Safety still queries DAY and drills.
  await page.getByText("Date Range", { exact: true }).click();
  await page.getByText("Custom Date Range…", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("2", { exact: true }).first().click();
  await dialog.getByText("4", { exact: true }).first().click();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await panel().getByRole("cell", { name: TYPE, exact: true }).waitFor();
  await page
    .getByText(/Custom-range percentages are not defined/)
    .first()
    .waitFor();
  await panel().getByRole("cell", { name: TYPE, exact: true }).click();
  await panel().getByText("1–25 of 27 reports", { exact: true }).waitFor();
  const last = safetyCalls().at(-1).params;
  assert.deepEqual(
    [last.from, last.to, last.granularity, last.date],
    ["2026-11-02", "2026-11-04", "DAY", undefined],
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished),
    ),
  );
  const mobileCard = await card().boundingBox(),
    mobilePanel = await panel().boundingBox();
  assert.ok(mobilePanel.y > mobileCard.y + mobileCard.height);
  assert.ok(
    mobilePanel.x + mobilePanel.width <= 390 &&
      mobileCard.x + mobileCard.width <= 390,
    JSON.stringify({ mobilePanel, mobileCard }),
  );
  // Existing Engineering header controls overflow at this width; the Safety column/panel must not.
  const headerScroll = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  await panel().getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(await panel().count(), 0);
  assert.deepEqual(errors, []);
  assert.ok(
    safetyCalls().every(
      (c) =>
        c.params.plant === "Banmore" &&
        !["category", "department", "status", "shift"].some(
          (key) => key in c.params,
        ),
    ),
  );
  console.info(
    JSON.stringify({
      result: "PASS",
      validation: "all APIs mocked, no production calls",
      safetyRequests: safetyCalls().length,
      mobileDocumentWidthWithExistingHeader: headerScroll,
      browserErrors: errors,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      errors,
      pageText: await page.locator("body").innerText(),
      safetyCalls: safetyCalls(),
    }),
  );
  throw error;
} finally {
  await browser.close();
  await vite.close();
}
