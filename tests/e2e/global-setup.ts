import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

export const ADMIN_STATE = path.join(__dirname, ".auth", "admin.json");

/** Sign in once as the seeded admin and save the session for the tests. */
export default async function globalSetup(config: FullConfig) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env");
  }
  const baseURL = config.projects[0].use.baseURL!;
  fs.mkdirSync(path.dirname(ADMIN_STATE), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 90_000 });
  await page.context().storageState({ path: ADMIN_STATE });
  await browser.close();
}
