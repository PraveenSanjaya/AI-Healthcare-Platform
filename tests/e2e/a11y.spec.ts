import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE } from "./global-setup";

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ storageState: ADMIN_STATE });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

const PAGES = [
  "/dashboard",
  "/templates",
  "/templates/plain-language-test-result-explainer",
  "/history",
  "/analytics",
  "/admin/users",
  "/admin/audit",
  "/admin/settings",
  "/admin/templates",
];

async function serious(p: Page) {
  const results = await new AxeBuilder({ page: p })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    for (const path of PAGES) {
      test(`${path} has no serious or critical accessibility violations`, async () => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        // Let streamed content settle.
        await page.waitForLoadState("networkidle");
        expect(await serious(page)).toEqual([]);
      });
    }
  });
}

test("the login page has no serious or critical violations", async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  expect(await serious(p)).toEqual([]);
  await ctx.close();
});

test("a keyboard user can reach the main content with the skip link", async () => {
  await page.goto("/dashboard");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("the layout fits a 375px phone without sideways scrolling", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: ADMIN_STATE,
    viewport: { width: 375, height: 800 },
  });
  const p = await ctx.newPage();
  for (const path of [
    "/dashboard",
    "/templates",
    "/templates/plain-language-test-result-explainer",
  ]) {
    await p.goto(path);
    await expect(p.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});
