import type { Page } from "@playwright/test";

/**
 * The login offers two methods (Kiorex Passport is the default, Password is behind the toggle). Open the password form when the toggle is there
 * (when the API does not offer Passport the form is already showing).
 */
export async function showPasswordForm(page: Page): Promise<void> {
  const tab = page.getByTestId("signin-method-password");
  const email = page.locator("#email");
  await tab.or(email).first().waitFor({ state: "visible", timeout: 60_000 });
  if (await tab.isVisible()) await tab.click();
}

/** Wait until post-login shell (not on /login). */
export async function login(page: Page, email: string, password = "demo"): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("cms-auth");
    // Keep the per-tab theme choice (made on the login screen before signing in); wipe everything else.
    const theme = sessionStorage.getItem("cms-theme-session");
    sessionStorage.clear();
    if (theme) sessionStorage.setItem("cms-theme-session", theme);
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await showPasswordForm(page);
  const emailField = page.locator("#email").or(page.getByLabel(/^email|البريد/i));
  await emailField.waitFor({ state: "visible", timeout: 60_000 });
  await emailField.fill(email);
  await page.locator("#password").fill(password);
  const submitLogin = async () => {
    const loginPost = page.waitForResponse(
      (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST",
      { timeout: 120_000 },
    );
    await page.getByRole("button", { name: /^(sign in|تسجيل الدخول)$/i }).click();
    return loginPost;
  };
  let res = await submitLogin();
  // The API rate-limits logins per email (20/min); honour Retry-After so a full-suite run does not fail on throttling.
  for (let attempt = 0; res.status() === 429 && attempt < 3; attempt += 1) {
    const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
    await page.waitForTimeout(((body.retryAfterSec ?? 20) + 1) * 1000);
    res = await submitLogin();
  }
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
