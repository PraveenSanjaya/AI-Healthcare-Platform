import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE } from "./global-setup";
import { DRAFT, STAFF, accountSession, deactivateAccount, ensureAccountActive } from "./helpers";

let adminContext: BrowserContext;
let admin: Page;
let staffContext: BrowserContext;
let staff: Page;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  admin = await adminContext.newPage();
  await ensureAccountActive(admin, STAFF);
  ({ context: staffContext, page: staff } = await accountSession(browser, STAFF));
});

test.afterAll(async () => {
  await staffContext?.close();
  if (admin) await deactivateAccount(admin, STAFF);
  await adminContext?.close();
});

test("MAIN FLOW: login, find a template, PHI is blocked, redact, generate, review, export", async () => {
  // Logged in already (accountSession used the real form). Find a patient-facing template.
  await staff.goto("/templates");
  await staff.getByLabel("Search").fill("test result");
  await staff.getByRole("button", { name: "Apply" }).click();
  await staff.getByRole("link", { name: /Plain-Language Test Result Explainer/ }).click();
  await expect(staff.getByRole("heading", { name: "Run this template" })).toBeVisible();

  // An email address is blocked before anything reaches the AI.
  await staff.locator("#var-age").fill("45");
  await staff.locator("#var-sex").selectOption("female");
  const field = staff.locator("#var-test_data");
  await field.fill("HbA1c 6.8%. Send results to nimali@example.com");
  const generate = staff.getByRole("button", { name: "Generate", exact: true });
  await expect(staff.locator("mark").filter({ hasText: "nimali@example.com" })).toBeVisible();
  await expect(generate).toBeDisabled();

  // Redact, and Generate is available again.
  await staff.getByRole("button", { name: "Redact all" }).click();
  await expect(field).toHaveValue(/\[REDACTED-EMAIL\]/);
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(staff.locator(DRAFT)).toContainText("Plain-Language Test Result Explainer");
  await expect(staff.locator("#refine-instruction")).toBeEnabled();

  // Patient-facing text cannot be copied or exported until it is reviewed.
  await expect(staff.getByRole("button", { name: "Copy", exact: true })).toBeDisabled();
  await expect(staff.getByRole("button", { name: ".pdf" })).toBeDisabled();
  await staff.getByLabel("I have reviewed this").click();
  await expect(staff.getByLabel("I have reviewed this")).toBeChecked();
  await expect(staff.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();

  // Export is now a real download.
  const link = staff.getByRole("link", { name: ".md" });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href"))!;
  const res = await staff.request.get(href);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Plain-Language Test Result Explainer");
});

test("Security headers are present and an oversized request is refused", async () => {
  const res = await staff.goto("/dashboard");
  const h = res!.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();

  const big = await staff.request.post("/api/generate", {
    data: { slug: "x", inputs: { a: "a".repeat(300 * 1024) } },
  });
  expect(big.status()).toBe(413);
  expect(await big.json()).toMatchObject({ error: "PAYLOAD_TOO_LARGE" });
  // Signed out callers learn nothing.
  const anon = await staff.context().browser()!.newContext();
  const anonRes = await anon.request.post("/api/generate", { data: {} });
  expect(anonRes.status()).toBe(401);
  await anon.close();
});

test("An unknown page shows the not-found page, not a stack trace", async () => {
  await staff.goto("/templates/this-template-does-not-exist");
  await expect(staff.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(await staff.locator("body").innerText()).not.toMatch(/\n\s+at \S+/);
});
