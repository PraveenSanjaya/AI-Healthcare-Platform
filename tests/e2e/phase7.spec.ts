import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE } from "./global-setup";
import { MANAGER, STAFF, accountSession, deactivateAccount, ensureAccountActive } from "./helpers";

let adminContext: BrowserContext;
let admin: Page;
let managerContext: BrowserContext;
let manager: Page;
let staffContext: BrowserContext;
let staff: Page;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  admin = await adminContext.newPage();
  await ensureAccountActive(admin, MANAGER);
  await ensureAccountActive(admin, STAFF);
  ({ context: managerContext, page: manager } = await accountSession(browser, MANAGER));
  ({ context: staffContext, page: staff } = await accountSession(browser, STAFF));
});

test.afterAll(async () => {
  await managerContext?.close();
  await staffContext?.close();
  if (admin) {
    await deactivateAccount(admin, MANAGER);
    await deactivateAccount(admin, STAFF);
  }
  await adminContext?.close();
});

test("P7-1. A manager sees analytics with numbers, charts and an estimate label", async () => {
  await manager.goto("/analytics");
  await expect(manager.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(manager.getByTestId("analytics-range")).toContainText("(30 days)");

  // Earlier tests created drafts, so there is data.
  const total = manager.getByTestId("tile-generations");
  await expect(total).toBeVisible();
  expect(Number((await total.innerText()).replace(/,/g, ""))).toBeGreaterThan(0);

  for (const label of [
    "PHI blocks",
    "PHI overrides",
    "Patient-facing review rate",
    "Average output length",
  ]) {
    await expect(manager.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(manager.getByText("Estimated cost (estimate)")).toBeVisible();
  await expect(manager.getByText(/lib\/analytics\/pricing\.ts/)).toBeVisible();

  // Charts exist, each with an equivalent table.
  for (const title of ["Generations per day", "Generations per template", "Generations per user"]) {
    await expect(manager.getByRole("region", { name: title })).toBeVisible();
  }
  await expect(manager.locator(".recharts-wrapper").first()).toBeVisible();
  await manager
    .getByRole("region", { name: "Generations per template" })
    .getByText("View as table")
    .click();
  await expect(
    manager.getByRole("region", { name: "Generations per template" }).getByRole("table"),
  ).toBeVisible();
});

test("P7-2. The date range works and an empty range shows an empty state", async () => {
  await manager.goto("/analytics?from=2020-01-01&to=2020-01-31");
  await expect(manager.getByTestId("analytics-range")).toContainText(
    "2020-01-01 to 2020-01-31 (31 days)",
  );
  await expect(manager.getByTestId("analytics-empty")).toBeVisible();
  await expect(manager.getByTestId("tile-generations")).toHaveText("0");
  await expect(manager.getByText("No data in this period.").first()).toBeVisible();

  // Nonsense dates fall back to the default range instead of failing.
  await manager.goto("/analytics?from=2026-13-45&to=banana");
  await expect(manager.getByTestId("analytics-range")).toContainText("(30 days)");
});

test("P7-3. Staff are blocked from analytics, and a manager from the audit log", async () => {
  expect((await staff.goto("/analytics"))?.status()).toBe(403);
  expect((await manager.goto("/admin/audit"))?.status()).toBe(403);
  expect((await manager.goto("/admin/users"))?.status()).toBe(403);
  // The nav offers a manager analytics and settings, but not the audit log.
  await manager.goto("/dashboard");
  await expect(manager.getByRole("link", { name: "Analytics" })).toBeVisible();
  await expect(manager.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  // And the CSV export is closed to them too.
  expect((await manager.request.get("/api/audit/export")).status()).toBe(403);
  expect((await staff.request.get("/api/audit/export")).status()).toBe(403);
});

test("P7-4. Logins, failed logins and user changes show up in the audit log", async ({
  browser,
}) => {
  // A failed login with a wrong password.
  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  await sp.goto("/login");
  await sp.getByLabel("Email").fill(MANAGER.email);
  await sp.getByLabel("Password").fill("definitely-the-wrong-password-1");
  await sp.getByRole("button", { name: "Sign in" }).click();
  await expect(sp.getByText("Invalid email or password.")).toBeVisible();
  await stranger.close();

  // User admin actions: deactivate then activate the manager.
  await admin.goto("/admin/users");
  const row = admin.getByRole("row").filter({ hasText: MANAGER.email });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row.getByRole("button", { name: "Activate", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();

  const expectRows = async (action: string) => {
    await admin.goto(`/admin/audit?action=${action}`);
    await expect(admin.getByRole("heading", { name: "Audit log" })).toBeVisible();
    const rows = admin.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.locator("td:nth-child(3)").allInnerTexts()) {
      expect(text.trim()).toBe(action);
    }
    return rows;
  };

  await expectRows("LOGIN_SUCCESS");
  const failed = await expectRows("LOGIN_FAILED");
  // The metadata detail shows a fingerprint and never the email or the password.
  await failed.first().getByText("View").click();
  const meta = await failed.first().locator("pre").innerText();
  expect(meta).toContain("emailFingerprint");
  expect(meta).not.toContain("e2e-manager");
  expect(meta).not.toContain("wrong-password");

  await expectRows("USER_DEACTIVATED");
  await expectRows("USER_ACTIVATED");
});

test("P7-5. The audit log filters by actor and date, and exports a CSV that is itself audited", async () => {
  // Filter by actor (the manager) and today's date.
  await admin.goto("/admin/audit");
  await admin.locator('select[name="actor"]').selectOption({ label: MANAGER.name });
  const today = new Date().toISOString().slice(0, 10);
  await admin.locator('input[name="from"]').fill(today);
  await admin.locator('input[name="to"]').fill(today);
  await admin.getByRole("button", { name: "Filter" }).click();
  await expect(admin.getByTestId("audit-count")).toBeVisible();
  const actors = await admin.locator("tbody tr td:nth-child(2)").allInnerTexts();
  expect(actors.length).toBeGreaterThan(0);
  expect(new Set(actors.map((a) => a.trim()))).toEqual(new Set([MANAGER.name]));

  // A range with nothing in it.
  await admin.goto("/admin/audit?from=2020-01-01&to=2020-01-02");
  await expect(admin.getByText("No audit entries match these filters.")).toBeVisible();

  // CSV export: right type, header, filtered rows.
  const res = await admin.request.get("/api/audit/export?action=LOGIN_SUCCESS");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toMatch(/audit-log-\d{4}-\d{2}-\d{2}\.csv/);
  const lines = (await res.text()).trim().split("\r\n");
  expect(lines[0]).toBe("id,createdAt,actorId,actorName,action,entityType,entityId,metadata");
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines.slice(1)) expect(line).toContain("LOGIN_SUCCESS");

  // The export itself is in the log, with the filter it used.
  await admin.goto("/admin/audit?action=AUDIT_EXPORTED");
  const first = admin.locator("tbody tr").first();
  await expect(first).toBeVisible();
  await first.getByText("View").click();
  await expect(first.locator("pre")).toContainText("LOGIN_SUCCESS");
});

test("P7-6. Nothing in the audit log holds draft text or personal details", async () => {
  // Generate a draft with a distinctive fact, then search the whole log CSV for it.
  await admin.goto("/templates/staff-spotlight-caption");
  await admin.locator("#var-doctor_name").fill("Perera");
  await admin.locator("#var-specialty").fill("Cardiology");
  await admin.locator("#var-fun_fact").fill("Secret-fact-ZZZ999");
  await admin.locator("#var-credentials").fill("MBBS");
  await admin.getByRole("button", { name: /^Generate/ }).click();
  await expect(admin.locator("#refine-instruction")).toBeEnabled();

  const csv = await (await admin.request.get("/api/audit/export")).text();
  expect(csv).not.toContain("Secret-fact-ZZZ999");
  expect(csv).not.toContain("deterministic mock draft");
  expect(csv).not.toMatch(/Valid-Passw0rd/);
  expect(csv).not.toContain("wrong-password");
});
