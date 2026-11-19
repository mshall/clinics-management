import { expect, type APIRequestContext, test } from "@playwright/test";
import { API_BASE, apiLogin, authHeaders } from "./golden-flow-helpers";
import { login } from "./helpers";

const receptionistEmail = "receptionist.hel@drahmedshall.com";

// one drawer per clinic: these tests share it
test.describe.configure({ mode: "serial" });

async function deskContext(request: APIRequestContext) {
  const headers = authHeaders((await apiLogin(request, receptionistEmail)).accessToken);
  const clinics = await request.get(`${API_BASE}/clinics`, { headers });
  expect(clinics.ok()).toBeTruthy();
  const body = await clinics.json();
  const list = (Array.isArray(body) ? body : body.items) as { id: string }[];
  const clinicId = list[0]!.id;
  const cur = await request.get(`${API_BASE}/billing/shifts/current?clinicId=${clinicId}`, { headers });
  expect(cur.ok(), await cur.text()).toBeTruthy();
  const open = (await cur.json()).open as { id: string } | null;
  if (open) {
    const res = await request.post(`${API_BASE}/billing/shifts/${open.id}/close`, { headers, data: { countedCash: 0, note: "e2e reset" } });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  return { headers, clinicId };
}

test("MN-03 open with a float, blind count, close and see the result", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { clinicId } = await deskContext(request);
  await login(page, receptionistEmail);
  await page.goto("/front-desk/cash-drawer");
  await expect(page.getByTestId("cash-drawer-page")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("combobox", { name: /clinic/i }).selectOption(clinicId);
  await page.getByTestId("opening-float").fill("100");
  await page.getByTestId("open-shift").click();
  await expect(page.getByTestId("shift-open")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("shift-open")).not.toContainText(/Expected cash/);
  await page.getByTestId("counted-cash").fill("100");
  await page.getByTestId("variance-note").fill("e2e count");
  await page.getByTestId("close-shift").click();
  await expect(page.getByTestId("shift-result")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("shift-closed")).toBeVisible();
});

test("MN-03 variance over the threshold flags the shift; owner reviews it", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { headers, clinicId } = await deskContext(request);
  const opened = await request.post(`${API_BASE}/billing/shifts/open`, { headers, data: { clinicId, openingFloat: 0 } });
  expect(opened.ok(), await opened.text()).toBeTruthy();
  const shiftId = (await opened.json()).id as string;

  await login(page, receptionistEmail);
  await page.goto("/front-desk/cash-drawer");
  await page.getByRole("combobox", { name: /clinic/i }).selectOption(clinicId);
  await expect(page.getByTestId("shift-open")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("counted-cash").fill("99999");
  await page.getByTestId("close-shift").click();
  await expect(page.getByTestId("variance-note")).toBeVisible();
  await page.getByTestId("variance-note").fill("e2e over-count");
  await page.getByTestId("close-shift").click();
  await expect(page.getByTestId("shift-result")).toHaveAttribute("data-review", "true", { timeout: 20_000 });

  const oh = authHeaders((await apiLogin(request, "admin@drahmedshall.com")).accessToken);
  const flagged = await request.get(`${API_BASE}/billing/shifts?needsReview=true&clinicId=${clinicId}`, { headers: oh });
  expect(((await flagged.json()) as { id: string }[]).some((s) => s.id === shiftId)).toBe(true);
  const review = await request.post(`${API_BASE}/billing/shifts/${shiftId}/review`, { headers: oh, data: { note: "e2e reviewed" } });
  expect(review.ok(), await review.text()).toBeTruthy();
  const pdf = await request.get(`${API_BASE}/billing/shifts/${shiftId}/z-report?format=thermal`, { headers: oh });
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
});
