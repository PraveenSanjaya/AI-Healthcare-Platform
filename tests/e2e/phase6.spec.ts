import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE } from "./global-setup";
import {
  DRAFT,
  deactivateStaff,
  ensureStaffActive,
  fillSpotlight,
  generateAndGetId,
  staffSession,
} from "./helpers";

const NOT_FOUND = "This page could not be found";
const SANDBOX = "e2e-sandbox-template";

let adminContext: BrowserContext;
let admin: Page;
let staffContext: BrowserContext;
let staff: Page;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  adminContext = await browser.newContext({
    storageState: ADMIN_STATE,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  admin = await adminContext.newPage();
  await ensureStaffActive(admin);
  ({ context: staffContext, page: staff } = await staffSession(browser));
});

test.afterAll(async () => {
  await staffContext?.close();
  if (admin) await deactivateStaff(admin);
  await adminContext?.close();
});

test("P6-1. Staff see only their own history; admin sees everyone's; reopen works", async () => {
  // An admin draft that staff must never see.
  await admin.goto("/templates/staff-spotlight-caption");
  await fillSpotlight(admin, "Admin-only fact AAA111");
  const adminGenId = await generateAndGetId(admin);

  // Staff create their own draft.
  await staff.goto("/templates/staff-spotlight-caption");
  await fillSpotlight(staff, "Staff fact BBB222");
  const staffGenId = await generateAndGetId(staff);

  // Staff history: own scope, own draft present, admin's absent.
  await staff.goto("/history");
  await expect(staff.getByTestId("history-scope")).toContainText("Your drafts");
  await expect(staff.locator(`a[href="/history/${staffGenId}"]`)).toBeVisible();
  await expect(staff.locator(`a[href="/history/${adminGenId}"]`)).toHaveCount(0);
  await expect(staff.getByRole("columnheader", { name: "User" })).toHaveCount(0);

  // Staff cannot open the admin's draft by guessing its address.
  await staff.goto(`/history/${adminGenId}`);
  await expect(staff.getByText(NOT_FOUND)).toBeVisible();
  await expect(staff.getByText("AAA111")).toHaveCount(0);

  // Admin history: everyone's, with the user column and both drafts.
  await admin.goto("/history");
  await expect(admin.getByTestId("history-scope")).toContainText("All users");
  await expect(admin.getByRole("columnheader", { name: "User" })).toBeVisible();
  await expect(admin.locator(`a[href="/history/${adminGenId}"]`)).toBeVisible();
  await expect(admin.locator(`a[href="/history/${staffGenId}"]`)).toBeVisible();
  await admin.goto(`/history/${staffGenId}`);
  await expect(admin.getByText("BBB222").first()).toBeVisible();
  // Admin is not the owner, so there is no Reopen.
  await expect(admin.getByRole("link", { name: "Reopen in the runner" })).toHaveCount(0);

  // The filter narrows the list.
  await staff.goto("/history?reviewed=yes");
  await expect(staff.locator(`a[href="/history/${staffGenId}"]`)).toHaveCount(0);
  await staff.goto("/history?reviewed=no");
  await expect(staff.locator(`a[href="/history/${staffGenId}"]`)).toBeVisible();

  // Owner can reopen: the draft and the refine box come back.
  await staff.goto(`/history/${staffGenId}`);
  await staff.getByRole("link", { name: "Reopen in the runner" }).click();
  await staff.waitForURL(/reopen=/);
  await expect(staff.locator(DRAFT)).toContainText("Staff Spotlight Caption");
  await expect(staff.locator("#var-fun_fact")).toHaveValue("Staff fact BBB222");
  await expect(staff.locator("#refine-instruction")).toBeEnabled();
});

test("P6-2. Staff cannot reach the admin pages", async () => {
  for (const path of [
    "/admin/templates",
    "/admin/templates/new",
    "/admin/settings",
    "/admin/users",
  ]) {
    const res = await staff.goto(path);
    expect(res?.status(), path).toBe(403);
  }
});

test("P6-3. Export is blocked before review and allowed after (server enforced)", async () => {
  await admin.goto("/templates/plain-language-test-result-explainer");
  await admin.locator("#var-age").fill("45");
  await admin.locator("#var-sex").selectOption("female");
  await admin.locator("#var-test_data").fill("HbA1c 6.8%");
  const id = await generateAndGetId(admin);

  // UI: export buttons are disabled before review.
  const group = admin.getByRole("group", { name: "Export" });
  for (const f of [".md", ".docx", ".pdf"]) {
    await expect(group.getByRole("button", { name: f })).toBeDisabled();
  }
  // Server: a hand-made request is refused.
  for (const f of ["md", "docx", "pdf"]) {
    const res = await admin.request.get(`/api/export/${id}?format=${f}`);
    expect(res.status(), f).toBe(409);
    expect((await res.json()).error).toBe("REVIEW_REQUIRED");
  }

  await admin.getByLabel("I have reviewed this").click();
  await expect(admin.getByLabel("I have reviewed this")).toBeChecked();
  await expect(group.getByRole("link", { name: ".pdf" })).toBeVisible();

  const md = await admin.request.get(`/api/export/${id}?format=md`);
  expect(md.status()).toBe(200);
  expect(await md.text()).toMatch(/AI draft — reviewed by .+ on \d{4}-\d{2}-\d{2}/);

  const pdf = await admin.request.get(`/api/export/${id}?format=pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  const docx = await admin.request.get(`/api/export/${id}?format=docx`);
  expect(docx.status()).toBe(200);
  expect((await docx.body()).subarray(0, 2).toString()).toBe("PK");

  // Someone else's draft is not exportable by staff, even by id.
  const other = await staff.request.get(`/api/export/${id}?format=md`);
  expect(other.status()).toBe(404);

  // A refinement changes the text, so the review (and with it the export) is cleared again.
  await admin.locator("#refine-instruction").fill("make it shorter");
  await admin.getByRole("button", { name: "Refine", exact: true }).click();
  await expect(admin.locator(DRAFT)).toContainText("make it shorter");
  await expect(admin.locator("#refine-instruction")).toBeEnabled();
  await expect(admin.getByLabel("I have reviewed this")).not.toBeChecked();
  expect((await admin.request.get(`/api/export/${id}?format=pdf`)).status()).toBe(409);
});

test("P6-4. Editing a template creates a new version and the runner uses it", async () => {
  await admin.goto(`/admin/templates/${SANDBOX}`);
  // The page streams in: wait for either the 404 or the editor before deciding.
  await expect(
    admin.getByText(NOT_FOUND).or(admin.getByText(/^Version \d+$/).first()),
  ).toBeVisible();
  const missing = await admin.getByText(NOT_FOUND).isVisible();
  if (missing) {
    await admin.goto("/admin/templates/new");
    await admin.getByLabel("Title", { exact: true }).fill("E2E Sandbox Template");
    await expect(admin.getByLabel(/^Slug/)).toHaveValue(SANDBOX);
    await admin.getByLabel("Description", { exact: true }).fill("Used by the browser tests");
    await admin.getByLabel(/^Category/).selectOption("internal-operations");
    await admin.getByLabel("Act as (role)").fill("a test writer");
    await admin.getByLabel("Context", { exact: true }).fill("Testing for {{topic}}");
    await admin.getByLabel(/^Task/).fill("Write about {{topic}}.");
    await admin.getByLabel("Constraints", { exact: true }).fill("Be brief.");
    await admin.getByLabel("Output format", { exact: true }).fill("One line.");
    await admin.getByRole("button", { name: "Add variable" }).click();
    const v = admin.getByRole("group", { name: "Variable 1" });
    await v.getByLabel("Name (snake_case)").fill("topic");
    await v.getByLabel("Label", { exact: true }).fill("Topic");
    await admin.getByRole("button", { name: "Create template" }).click();
    await admin.waitForURL(`**/admin/templates/${SANDBOX}`);
  } else if (await admin.getByRole("button", { name: "Unarchive" }).isVisible()) {
    await admin.getByRole("button", { name: "Unarchive" }).click();
    await expect(admin.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  }

  const badge = admin.getByText(/^Version \d+$/).first();
  const before = Number((await badge.innerText()).replace("Version ", ""));

  // Edit the wording: this must create the next version.
  const marker = `E2E-MARKER-${Date.now()}`;
  await admin.getByLabel(/^Task/).fill(`Write about {{topic}}. ${marker}`);
  await expect(admin.getByTestId("template-preview")).toContainText(marker);
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByText(`Saved as version ${before + 1}`)).toBeVisible();
  await expect(admin.getByText(`Version ${before + 1}`).first()).toBeVisible();

  // Version history keeps the older version and shows a diff.
  const history = admin.getByRole("region", { name: "Version history" });
  await expect(history).toContainText(`Version ${before + 1} (current)`);
  await expect(history).toContainText(`Version ${before}`);
  await history
    .getByText(/change.* from version/)
    .first()
    .click();
  await expect(history).toContainText(marker);

  // The runner uses the new version.
  await admin.goto(`/templates/${SANDBOX}`);
  await admin.locator("#var-topic").fill("sandbox");
  await admin.getByText("View full prompt").click();
  await expect(admin.locator("details pre").last()).toContainText(marker);

  // A saved generation records the version it used.
  const id = await generateAndGetId(admin);
  await admin.goto(`/history/${id}`);
  await expect(admin.getByText(`template version ${before + 1}`)).toBeVisible();

  // Archiving hides it from the library and from running.
  await admin.goto(`/admin/templates/${SANDBOX}`);
  await admin.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(admin.getByText("Archived", { exact: true })).toBeVisible();
  await admin.goto("/templates?q=E2E+Sandbox");
  await expect(admin.getByText("E2E Sandbox Template")).toHaveCount(0);
  await admin.goto(`/templates/${SANDBOX}`);
  await expect(admin.getByText(NOT_FOUND)).toBeVisible();
});

test("P6-5. A settings change shows up in the rendered prompt, and is restored", async () => {
  await admin.goto("/admin/settings");
  const name = admin.locator("#s-clinicName");
  const original = await name.inputValue();
  const changed = `E2E Clinic ${Date.now()}`;
  try {
    await name.fill(changed);
    await admin.getByRole("button", { name: "Save settings" }).click();
    await expect(admin.getByText("Settings saved.")).toBeVisible();

    await admin.goto("/templates/overdue-screening-reminder");
    await expect(admin.locator("#var-clinic_name")).toHaveValue(changed);
    await admin.locator("#var-screening").fill("mammogram");
    await admin.getByText("View full prompt").click();
    await expect(admin.locator("details pre").first()).toContainText(`Clinic: ${changed}`);
    await expect(admin.locator("details pre").last()).toContainText(changed);
  } finally {
    await admin.goto("/admin/settings");
    await admin.locator("#s-clinicName").fill(original);
    await admin.getByRole("button", { name: "Save settings" }).click();
    await expect(admin.getByText(/Settings saved\.|No changes to save\./)).toBeVisible();
  }
});

test("P6-6. Settings validation: the emergency number is required", async () => {
  await admin.goto("/admin/settings");
  const field = admin.locator("#s-emergencyNumber");
  const original = await field.inputValue();
  await field.fill("");
  await admin.getByRole("button", { name: "Save settings" }).click();
  await expect(admin.getByText("Emergency number is required")).toBeVisible();
  await admin.goto("/admin/settings");
  await expect(admin.locator("#s-emergencyNumber")).toHaveValue(original);
});
