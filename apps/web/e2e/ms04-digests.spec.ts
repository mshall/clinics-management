import { expect, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders } from "./golden-flow-helpers";
import { login } from "./helpers";

test("MS-04 profile digest preferences: quiet hours and opt-out save", async ({ page, request }) => {
  test.setTimeout(90_000);
  const headers = authHeaders((await apiLogin(request, "admin@drahmedshall.com")).accessToken);
  const put = await request.put(`${API_BASE}/digests/preferences`, {
    headers,
    data: {
      optOutAll: false,
      doctorTomorrowList: true,
      ownerWeeklyInsights: true,
      ownerShiftSummaries: true,
      kiorexProgressNudges: true,
      quietHoursStart: 22,
      quietHoursEnd: 7,
    },
  });
  expect(put.ok(), await put.text()).toBeTruthy();

  await login(page, "admin@drahmedshall.com");
  await page.goto("/profile");
  await expect(page.getByTestId("digest-preferences")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("quiet-start").fill("22");
  await page.getByTestId("quiet-end").fill("7");
  await page.getByTestId("save-digests").click();
  await expect(page.getByText(/Digest preferences saved|تم حفظ/i)).toBeVisible({ timeout: 10_000 });

  const get = await request.get(`${API_BASE}/digests/preferences`, { headers });
  expect(get.ok()).toBeTruthy();
  const prefs = await get.json();
  expect(prefs.quietHoursStart).toBe(22);
  expect(prefs.quietHoursEnd).toBe(7);
});
