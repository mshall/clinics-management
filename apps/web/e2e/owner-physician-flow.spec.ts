import { expect, test, type APIRequestContext } from "@playwright/test";
import { login } from "./helpers";

const API_BASE = process.env.PLAYWRIGHT_API_URL ?? `${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5174"}/api/v1`;
async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    accessToken: string;
    user: { role: string; additionalRoles?: string[]; roleNavTabKeys?: string[] };
  };
}

test.describe("owner-physician golden flow", () => {
  test("physician with group_admin additional role sees encounters and admin", async ({ page, request }) => {
    const admin = await apiLogin(request, "admin@drahmedshall.com", "demo");
    const users = await request.get(`${API_BASE}/admin/users?q=dr.ahmed`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
    });
    expect(users.ok()).toBeTruthy();
    const list = (await users.json()) as { items: Array<{ id: string; email: string }> };
    const target = list.items.find((u) => u.email === "dr.ahmed@drahmedshall.com");
    expect(target).toBeTruthy();

    const patch = await request.patch(`${API_BASE}/admin/users/${target!.id}/roles`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { additionalRoles: ["GROUP_ADMIN"] },
    });
    expect(patch.ok()).toBeTruthy();

    const session = await apiLogin(request, "dr.ahmed@drahmedshall.com", "demo");
    expect(session.user.additionalRoles).toContain("GROUP_ADMIN");
    expect(session.user.roleNavTabKeys ?? []).toEqual(expect.arrayContaining(["admin", "encounters"]));

    await login(page, "dr.ahmed@drahmedshall.com");
    await expect(page.getByRole("link", { name: /encounters/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /administration|admin/i })).toBeVisible();
  });
});