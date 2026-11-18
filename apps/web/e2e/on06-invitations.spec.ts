import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("ON-06 staff invitations", () => {
  test("owner invites a receptionist by email; invitee accepts and signs in", async ({ page, browser }) => {
    await login(page, "admin@kiorly.com");
    await page.goto("/team");
    const email = `e2e.invite.${Date.now()}@example.com`;
    await page.locator("#invite-contact").fill(email);
    await page.locator("#invite-name").fill("E2E Reception");
    await page.getByRole("button", { name: /Send invitation/ }).click();
    const link = (await page.getByTestId("invite-link").textContent())?.trim() ?? "";
    expect(link).toContain("/invite/");
    await expect(page.getByTestId("staff-invitations")).toContainText(email);

    const ctx = await browser.newContext();
    const guest = await ctx.newPage();
    await guest.goto(new URL(link).pathname);
    await expect(guest.getByText(/invited you as Receptionist/)).toBeVisible();
    await guest.locator("#accept-password").fill("welcome123");
    await guest.getByRole("button", { name: /Accept and set password/ }).click();
    await expect(guest.getByTestId("invite-accepted")).toBeVisible();
    await login(guest, email, "welcome123");
    await expect(guest).not.toHaveURL(/login/);

    await guest.goto(new URL(link).pathname);
    await expect(guest.getByTestId("invite-error")).toBeVisible();
    await ctx.close();
  });
});
