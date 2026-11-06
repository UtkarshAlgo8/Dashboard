/* global process */
/** Mock-only BTP date and stored-period caption regression. */
import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
process.env.VITE_API_BASE_URL = "/api/v1";
const vite = await createServer({
  root: new URL("../", import.meta.url).pathname,
  cacheDir: "/tmp/btp-date-browser-vite-cache",
  server: { host: "127.0.0.1", port: 5183, strictPort: true },
});
await vite.listen();
const origin = "http://127.0.0.1:5183";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1520, height: 1100 } });
await page.clock.setFixedTime(new Date("2026-11-05T08:00:00Z"));
const calls = [],
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const u = new URL(route.request().url());
  if (u.origin !== origin) return route.abort();
  if (!u.pathname.startsWith("/api/v1/")) return route.continue();
  calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams) });
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
  if (u.pathname.endsWith("/as-of")) data = { asOf: "2026-11-05" };
  if (u.pathname.endsWith("/quality/process/summary"))
    data = {
      values: {
        Plant_quality_rating_o: 95,
        Plan_Compliance_o: 90,
        Total_Violations_o: 2,
      },
    };
  if (u.pathname.endsWith("/engineering/safety")) {
    data = {
      context: {
        ...Object.fromEntries(u.searchParams),
        plant: "Banmore",
        level: u.searchParams.get("level") ?? "overall",
        offset: Number(u.searchParams.get("offset") ?? 0),
        limit: Number(u.searchParams.get("limit") ?? 25),
      },
      value: null,
      rows: [],
      page: { offset: 0, limit: 25, total: 0, hasMore: false },
    };
  }
  if (u.pathname.endsWith("/compliance")) {
    const date = u.searchParams.get("date"),
      granularity = u.searchParams.get("granularity"),
      level = u.searchParams.get("level"),
      ids = u.searchParams.get("kpis").split(",");
    if (date === "2026-09-01")
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Fixture compliance outage" },
        }),
      });
    if (date === "2026-10-01")
      await new Promise((resolve) => setTimeout(resolve, 120));
    data = {
      context: {
        date,
        granularity,
        level,
        ...(u.searchParams.has("section")
          ? { section: u.searchParams.get("section") }
          : {}),
      },
      kpis: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            value:
              date === "2026-10-01"
                ? null
                : id === "pm"
                  ? 100
                  : id === "daily"
                    ? 12.34
                    : 1,
            counts: {},
            rows: [],
          },
        ]),
      ),
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
const complianceCalls = () =>
  calls.filter((c) => c.path.endsWith("/compliance"));
const pickRange = async (a, b, trigger) => {
  await page.getByText(trigger, { exact: true }).click();
  await page.getByText("Custom Date Range…", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(String(a), { exact: true }).first().click();
  await dialog.getByText(String(b), { exact: true }).first().click();
  await dialog.getByRole("button", { name: "Apply" }).click();
};
try {
  await page.goto(`${origin}/banmore/quality`);
  await page
    .getByText("Severe violation rate · lower is better · Nov 2026", {
      exact: true,
    })
    .waitFor();
  await pickRange(3, 3, "Date Range");
  await page.getByText("03 Nov – 03 Nov", { exact: true }).waitFor();
  await page
    .getByText("Severe violation rate · lower is better · 03 Nov 2026", {
      exact: true,
    })
    .waitFor();
  assert.ok(
    complianceCalls().some(
      (c) =>
        c.params.date === "2026-11-03" &&
        c.params.granularity === "DAY" &&
        c.params.kpis === "critical",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.path.endsWith("/quality/process/summary") &&
        c.params.date === "2026-11-03",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.path.endsWith("/quality/process/kpi-history") &&
        c.params.date_to === "2026-11-03",
    ),
  );
  const exactTrend = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith("/quality/process/kpi-history") &&
      url.searchParams.get("kpi_name") === "Plant_quality_rating_o" &&
      url.searchParams.get("date_from") === "2026-11-03" &&
      url.searchParams.get("date_to") === "2026-11-03"
    );
  });
  await page
    .getByRole("button", {
      name: "View PQR / Process Audit Rating trend",
      exact: true,
    })
    .click();
  await exactTrend;
  await page.keyboard.press("Escape");
  await page.getByText("Product", { exact: true }).click();
  await page.getByText("Overall Production Yield", { exact: true }).waitFor();
  assert.ok(
    calls.some(
      (c) =>
        c.path.endsWith("/quality/product/summary") &&
        c.params.date === "2026-11-03",
    ),
  );
  await page.getByText("Process", { exact: true }).click();
  await page
    .getByText("Severe violation rate · lower is better · 03 Nov 2026", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: "Open Critical Parameter Compliance drill-down",
      exact: true,
    })
    .click();
  await page
    .getByText(/03 Nov 2026 · Published values at this level/)
    .waitFor();
  assert.ok(
    complianceCalls().some(
      (c) =>
        c.params.date === "2026-11-03" &&
        c.params.granularity === "DAY" &&
        c.params.level === "section",
    ),
  );
  await pickRange(2, 4, "03 Nov – 03 Nov");
  await page.getByText("02 Nov – 04 Nov", { exact: true }).waitFor();
  await pickRange(4, 2, "02 Nov – 04 Nov");
  await page.getByText("02 Nov – 04 Nov", { exact: true }).waitFor();
  await page.getByText("Today", { exact: true }).click();
  await page
    .getByText("Severe violation rate · lower is better · 05 Nov 2026", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("combobox").filter({ hasText: "All Shifts" }).click();
  await page.getByRole("option", { name: "Shift A", exact: true }).click();
  await page
    .getByText(
      "Severe violation rate · lower is better · 05 Nov 2026 · Shift A",
      { exact: true },
    )
    .waitFor();
  assert.ok(
    complianceCalls().some(
      (c) =>
        c.params.date === "2026-11-05" && c.params.granularity === "SHIFT A",
    ),
  );
  await page.getByText("This Month", { exact: true }).click();
  await page
    .getByText("Severe violation rate · lower is better · Nov 2026", {
      exact: true,
    })
    .waitFor();
  await page.goto(`${origin}/banmore/engineering`);
  await page.getByText("Maintenance", { exact: true }).first().click();
  await page
    .getByText("Published Gold compliance · Nov 2026", { exact: true })
    .first()
    .waitFor();
  assert.ok(
    complianceCalls().some(
      (c) =>
        c.params.date === "2026-11-01" &&
        c.params.granularity === "MONTH" &&
        c.params.kpis.includes("pm"),
    ),
  );
  await page
    .getByRole("button", { name: "Open PM Compliance drill-down", exact: true })
    .click();
  await page.getByText(/Nov 2026 · Published values at this level/).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByText("Date Range", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Oct 2026" }).click();
  await page.getByText("Loading…", { exact: true }).first().waitFor();
  await page
    .getByText("No published data for this period", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByText("Published Gold compliance · Nov 2026", { exact: true })
      .count(),
    0,
  );
  await page.getByRole("banner").getByText("Oct 2026", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Sep 2026" }).click();
  await page
    .getByText(/Compliance unavailable: Fixture compliance outage/)
    .waitFor();
  assert.equal(
    await page
      .getByText("Published Gold compliance · Nov 2026", { exact: true })
      .count(),
    0,
  );
  await page.getByRole("banner").getByText("Sep 2026", { exact: true }).click();
  await page.getByRole("menuitem", { name: "Aug 2026" }).click();
  await page
    .getByText("Published Gold compliance · Aug 2026", { exact: true })
    .first()
    .waitFor();
  assert.ok(
    complianceCalls().some(
      (c) => c.params.date === "2026-08-01" && c.params.granularity === "MONTH",
    ),
  );
  await page.getByText("This Month", { exact: true }).click();
  await page
    .getByText("Published Gold compliance · Nov 2026", { exact: true })
    .first()
    .waitFor();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(
    calls.filter((c) => /freshness|compliance\/as.of/i.test(c.path)).length,
    0,
  );
  console.info(
    JSON.stringify(
      {
        result: "PASS",
        validation: "all APIs mocked; no production data",
        calls: calls.length,
        complianceCalls: complianceCalls(),
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      errors,
      pageText: await page.locator("body").innerText(),
      calls,
    }),
  );
  throw error;
} finally {
  await browser.close();
  await vite.close();
}
