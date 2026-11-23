import { expect, test, type APIRequestContext } from "@playwright/test";
import { login } from "./helpers";

/**
 * ADR-039: real two-browser P2P WebRTC call. Chromium runs with fake camera/mic (no hardware, no prompts) and a loopback-friendly ICE
 * setup, so STUN-only (no Cloudflare secret) is enough: the two contexts connect directly. Flow: doctor + patient reach
 * connectionState "connected", media flows both ways, switch to audio-only, then the doctor ends and the patient sees the end screen.
 */
test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
      "--allow-loopback-in-peer-connection",
    ],
  },
  permissions: ["camera", "microphone"],
});

const DOCTOR = process.env.TELEHEALTH_E2E_DOCTOR ?? "nadia.na@demo.kiorex.test";
const PASSWORD = process.env.TELEHEALTH_E2E_PASSWORD ?? "Demo@12345";

async function seedVisit(request: APIRequestContext): Promise<{ sessionId: string; joinUrl: string }> {
  const l = await request.post("/api/v1/auth/login", { data: { email: DOCTOR, password: PASSWORD } });
  expect(l.ok()).toBeTruthy();
  const { accessToken, user } = (await l.json()) as { accessToken: string; user: { id: string } };
  const headers = { Authorization: `Bearer ${accessToken}` };
  await request.put(`/api/v1/telehealth/settings/${user.id}`, { headers, data: { offersTelehealth: true } });
  const clinics = (await (await request.get("/api/v1/clinics", { headers })).json()) as { id: string }[] | { items: { id: string }[] };
  const clinicId = (Array.isArray(clinics) ? clinics : clinics.items)[0]!.id;
  const patients = (await (await request.get("/api/v1/patients?pageSize=5", { headers })).json()) as { items: { id: string; phone?: string }[] };
  const patient = patients.items.find((p) => p.phone) ?? patients.items[0]!;
  const startsAt = new Date(Date.now() + 2 * 60_000).toISOString();
  const created = await request.post("/api/v1/appointments", { headers, data: { clinicId, clinicianId: user.id, patientId: patient.id, startsAt, visitMode: "TELEHEALTH", confirmOverlap: true, allowDoubleBook: true } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const apt = (await created.json()) as { telehealth?: { sessionId: string; joinUrl: string } };
  expect(apt.telehealth?.joinUrl).toBeTruthy();
  return { sessionId: apt.telehealth!.sessionId, joinUrl: apt.telehealth!.joinUrl };
}

test("doctor and patient connect P2P, switch to audio-only, and end the visit", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const { sessionId, joinUrl } = await seedVisit(request);
  const patientPath = new URL(joinUrl).pathname;

  const doctorCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const patientCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const doctor = await doctorCtx.newPage();
  const patient = await patientCtx.newPage();

  await login(doctor, DOCTOR, PASSWORD);
  await doctor.goto(`/telehealth/${sessionId}`);
  await patient.goto(patientPath);

  // patient page shows the visit and the device timezone; both pass the device check
  await expect(patient.getByTestId("th-time-device")).toContainText(/\(.+\)/);
  await expect(doctor.getByTestId("th-device-check")).toBeVisible({ timeout: 30_000 });
  await expect(patient.getByTestId("th-device-check")).toBeVisible({ timeout: 30_000 });
  await doctor.getByTestId("th-join").click();
  await patient.getByTestId("th-join").click();

  await expect(doctor.getByTestId("th-call")).toHaveAttribute("data-connection-state", "connected", { timeout: 60_000 });
  await expect(patient.getByTestId("th-call")).toHaveAttribute("data-connection-state", "connected", { timeout: 60_000 });

  // media really flows both ways (fake device = test pattern)
  for (const page of [doctor, patient]) {
    await expect.poll(() => page.getByTestId("th-remote").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  }
  await expect(doctor.getByTestId("th-quality")).toBeVisible();

  // audio-only from the doctor: both pages reflect it (the patient learns it from the polled mode)
  await doctor.getByTestId("th-audio-only").click();
  await expect(doctor.getByTestId("th-call")).toHaveAttribute("data-audio-only", "1");
  await expect(patient.getByTestId("th-call")).toHaveAttribute("data-audio-only", "1", { timeout: 15_000 });
  await expect(doctor.getByTestId("th-call")).toHaveAttribute("data-connection-state", "connected");

  // end: doctor ends, patient sees the end screen
  await doctor.getByTestId("th-end").click();
  await expect(doctor.getByTestId("th-ended")).toBeVisible({ timeout: 15_000 });
  await expect(patient.getByTestId("th-state-ended")).toBeVisible({ timeout: 20_000 });

  await doctorCtx.close();
  await patientCtx.close();
});
