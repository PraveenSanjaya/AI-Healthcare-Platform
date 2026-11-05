import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE } from "./global-setup";
import { DRAFT, deactivateStaff, ensureStaffActive, fillSpotlight, staffSession } from "./helpers";

let context: BrowserContext;
let page: Page;

const generate = () => page.getByRole("button", { name: /^Generate/ });
const copy = () => page.getByRole("button", { name: "Copy", exact: true });
const reviewBox = () => page.getByLabel("I have reviewed this");
const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

/** Wait until a draft has finished streaming and been saved (Refine becomes usable). */
async function waitForDraftReady() {
  await expect(page.locator("#refine-instruction")).toBeEnabled();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({
    storageState: ADMIN_STATE,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test("1. B1 shows the form, the prompt panel and the review label", async () => {
  await page.goto("/templates/plain-language-test-result-explainer");
  await expect(page.getByRole("heading", { name: "Run this template" })).toBeVisible();
  await expect(page.locator("#var-test_data")).toBeVisible();
  await expect(page.getByText("View full prompt")).toBeVisible();
  await expect(page.getByText("AI draft — review before use")).toBeVisible();
  await expect(generate()).toBeEnabled();
});

test("2. PHI is highlighted, Generate is blocked, admin override works", async () => {
  await page.locator("#var-test_data").fill("Patient Mr. Silva, phone 0771234567, HbA1c 6.8%");
  await expect(page.locator("mark").filter({ hasText: "0771234567" })).toBeVisible();
  await expect(page.locator("mark").filter({ hasText: "Silva" })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "possible personal detail" }),
  ).toBeVisible();
  await expect(generate()).toBeDisabled();

  const reason = page.getByLabel(/Administrator override/);
  await expect(reason).toBeVisible();
  await reason.fill("Testing the override path");
  await expect(page.getByRole("button", { name: "Generate with override" })).toBeEnabled();

  await reason.fill("");
  await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeDisabled();
});

test("3. Redact all replaces the name and phone and re-enables Generate", async () => {
  await page.getByRole("button", { name: "Redact all" }).click();
  const field = page.locator("#var-test_data");
  await expect(field).toHaveValue(/\[REDACTED-PHONE\]/);
  await expect(field).toHaveValue(/\[REDACTED-NAME\]/);
  await expect(field).not.toHaveValue(/0771234567/);
  await expect(field).not.toHaveValue(/Silva/);
  await expect(page.locator("mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeEnabled();
});

test("4. Generate streams the mock output and shows the counter", async () => {
  await page.locator("#var-age").fill("45");
  await page.locator("#var-sex").selectOption("female");
  await generate().click();
  const draft = page.locator(DRAFT);
  await expect(draft).toContainText("Plain-Language Test Result Explainer");
  await expect(draft).toContainText("deterministic mock draft");
  await waitForDraftReady();
  await expect(draft.getByText(/\d+ words · \d+ characters/)).toBeVisible();
  await expect(page.getByText("AI draft — review before use")).toBeVisible();
});

test("5. Copy is disabled for patient-facing B1 before review", async () => {
  await expect(reviewBox()).not.toBeChecked();
  await expect(copy()).toBeDisabled();
});

test("6. Ticking review enables Copy, which copies the draft", async () => {
  await reviewBox().click();
  await expect(reviewBox()).toBeChecked();
  await expect(copy()).toBeEnabled();
  await copy().click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await clipboard()).toMatch(/^# Plain-Language Test Result Explainer/);
});

test("7. Refining produces a new output and clears the review tick", async () => {
  await page.locator("#refine-instruction").fill("make it shorter");
  await page.getByRole("button", { name: "Refine", exact: true }).click();
  const draft = page.locator(DRAFT);
  await expect(draft).toContainText("Refinement applied:");
  await expect(draft).toContainText("make it shorter");
  await expect(page.getByText("Refinements applied")).toBeVisible();
  await waitForDraftReady();
  await expect(reviewBox()).not.toBeChecked();
  await expect(copy()).toBeDisabled();
});

test("8. F1 shows the 160-character limit and no warning with the mock", async () => {
  await page.goto("/templates/overdue-screening-reminder");
  await page.locator("#var-clinic_name").fill("Lakeside Clinic");
  await page.locator("#var-screening").fill("mammogram");
  await generate().click();
  const draft = page.locator(DRAFT);
  await expect(draft.getByText(/limit 160 characters/)).toBeVisible();
  await waitForDraftReady();
  await expect(page.getByText(/Over the limit/)).toHaveCount(0);
  const counter = await draft.getByText(/\d+ words · \d+ characters/).innerText();
  expect(Number(/(\d+) characters/.exec(counter)![1])).toBeLessThanOrEqual(160);
});

test("9. A2 (internal) can be copied without a review tick", async () => {
  await page.goto("/templates/coordination-meeting-minutes");
  await expect(reviewBox()).toHaveCount(0);
  await page.locator("#var-transcript").fill("Agenda reviewed. Decision: move the huddle to 8am.");
  await generate().click();
  await expect(page.locator(DRAFT)).toContainText("Coordination Meeting Minutes");
  await waitForDraftReady();
  await expect(copy()).toBeEnabled();
  await copy().click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await clipboard()).toMatch(/^# Coordination Meeting Minutes/);
});

test("10. A STAFF user can run a template but is blocked from /admin/users", async ({
  browser,
}) => {
  await ensureStaffActive(page);
  const { context: staffContext, page: staff } = await staffSession(browser);
  try {
    await staff.goto("/templates/staff-spotlight-caption");
    await fillSpotlight(staff);
    await staff.getByRole("button", { name: /^Generate/ }).click();
    await expect(staff.locator(DRAFT)).toContainText("Staff Spotlight Caption");
    await expect(staff.locator("#refine-instruction")).toBeEnabled();

    // The admin-only option does not even appear for STAFF.
    await staff.locator("#var-fun_fact").fill("Call 0771234567");
    await expect(staff.getByLabel(/Administrator override/)).toHaveCount(0);
    await expect(staff.getByRole("button", { name: "Generate", exact: true })).toBeDisabled();

    const res = await staff.goto("/admin/users");
    expect(res?.status()).toBe(403);
    await expect(staff.getByText("Forbidden")).toBeVisible();
  } finally {
    await staffContext.close();
    await deactivateStaff(page);
  }
});
