import type { Page } from "@playwright/test";

/** Wait until post-login shell (not on /login). */
export async function login(page: Page, email: string, password = "demo"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20_000 });
}
