import type { Page } from "@playwright/test";

/** Wait until post-login shell (not on /login). */
export async function login(page: Page, email: string, password = "demo"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/^email/i).fill(email);
  await page.locator("#password").fill(password);
  const loginPost = page.waitForResponse(
    (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  const res = await loginPost;
  if (!res.ok()) {
    const body = await res.text().catch(() => "");
    throw new Error(`Login API ${res.status()}: ${body.slice(0, 500)}`);
  }
  await page.waitForURL((u) => !u.pathname.includes("login"), {
    timeout: 120_000,
    /** Heavy /patients first paint can delay domcontentloaded; commit is enough for URL change. */
    waitUntil: "commit",
  });
}
