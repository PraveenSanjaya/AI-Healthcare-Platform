import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const DRAFT = 'section[aria-label="Generated draft"]';

/** The one reusable staff account the suite uses. Removed by `npm run db:clean-e2e`. */
export const STAFF = { email: "e2e-staff@clinic.local", password: "Valid-Passw0rd-ok" };

/** As admin: create the staff account if missing, or reactivate it. */
export async function ensureStaffActive(admin: Page) {
  await admin.goto("/admin/users");
  // The table streams in; wait for the admin's own row before asking whether ours exists.
  await expect(admin.getByRole("row").filter({ hasText: "(you)" })).toBeVisible();
  const row = admin.getByRole("row").filter({ hasText: STAFF.email });
  if ((await row.count()) === 0) {
    await admin.getByPlaceholder("Name").fill("E2E Staff");
    await admin.getByPlaceholder("Email").fill(STAFF.email);
    await admin.getByPlaceholder(/Temporary password/).fill(STAFF.password);
    await admin.getByRole("button", { name: "Create user" }).click();
    await expect(admin.getByText("User created.")).toBeVisible();
  } else if (await row.getByRole("button", { name: "Activate", exact: true }).isVisible()) {
    await row.getByRole("button", { name: "Activate", exact: true }).click();
  }
  await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
  await expect(row.getByRole("combobox")).toHaveValue("STAFF");
}

/** As admin: leave the staff account deactivated; the next run reactivates it. */
export async function deactivateStaff(admin: Page) {
  await admin.goto("/admin/users");
  const row = admin.getByRole("row").filter({ hasText: STAFF.email });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row.getByRole("button", { name: "Activate", exact: true })).toBeVisible();
}

/** Sign in as the staff user in a brand-new browser context. */
export async function staffSession(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByLabel("Password").fill(STAFF.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  return { context, page };
}

/**
 * Click Generate, wait for the draft to finish, and return the saved generation id.
 * (A streamed response body cannot be read back by the test, so the id is taken from the
 * newest row of the user's History, opened in a second tab so the runner state is kept.)
 */
export async function generateAndGetId(page: Page): Promise<string> {
  await page.getByRole("button", { name: /^Generate/ }).click();
  await expect(page.locator("#refine-instruction")).toBeEnabled();
  const tab = await page.context().newPage();
  try {
    await tab.goto("/history");
    const link = tab.locator('tbody a[href^="/history/"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    return href!.replace("/history/", "");
  } finally {
    await tab.close();
  }
}

export async function fillSpotlight(page: Page, fact = "Runs marathons") {
  await page.locator("#var-doctor_name").fill("Perera");
  await page.locator("#var-specialty").fill("Cardiology");
  await page.locator("#var-fun_fact").fill(fact);
  await page.locator("#var-credentials").fill("MBBS");
}
