import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API_BASE = process.env.PLAYWRIGHT_API_URL ?? `${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5174"}/api/v1`;
export type ApiSession = {
  accessToken: string;
  user: { id: string; tenantId?: string | null; role?: string; email?: string };
};

export function authHeaders(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password = "demo",
): Promise<ApiSession> {
  let res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  // The API rate-limits logins per email (20/min); a full-suite run exceeds that, so honour Retry-After instead of failing.
  for (let attempt = 0; res.status() === 429 && attempt < 3; attempt += 1) {
    const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
    await new Promise((r) => setTimeout(r, ((body.retryAfterSec ?? 20) + 1) * 1000));
    res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  }
  expect(res.ok(), `login ${email}: ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as {
    accessToken: string;
    user: { id: string; tenantId?: string | null; role?: string; email?: string };
  };
  return { accessToken: body.accessToken, user: body.user };
}

async function jsonOk<T>(res: { ok: () => boolean; text: () => Promise<string>; json: () => Promise<T> }): Promise<T> {
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}

export type GoldenFlowActors = {
  receptionistEmail: string;
  physicianEmail: string;
  adminEmail?: string;
  financeEmail?: string;
};

export type GoldenFlowOptions = GoldenFlowActors & {
  bookingSource?: "FRONT_DESK" | "KIOREX_MARKETPLACE";
  /** Pre-collect visit fee via InstaPay at check-in (default true). */
  checkInInstaPay?: boolean;
  /** Book with scheduled transfer deposit (Kiorex path). */
  scheduledDeposit?: boolean;
};

export type GoldenFlowResult = {
  clinicId: string;
  patientId: string;
  clinicianId: string;
  appointmentId: string;
  encounterId: string;
};

function isoSlotIn(minutesFromNow: number): string {
  const jitter = Math.floor(Math.random() * 14_400);
  return new Date(Date.now() + (minutesFromNow + jitter) * 60_000).toISOString();
}

export type BookedAppointment = {
  clinicId: string;
  patientId: string;
  clinicianId: string;
  appointmentId: string;
  fee: number;
};

/** Seeds a confirmed front-desk appointment (InstaPay enabled for the tenant) — check-in is left to the caller. */
export async function bookAppointmentViaApi(
  request: APIRequestContext,
  opts: GoldenFlowOptions,
): Promise<BookedAppointment> {
  const adminEmail = opts.adminEmail ?? "admin@drahmedshall.com";
  const admin = await apiLogin(request, adminEmail);
  const h = authHeaders(admin.accessToken);
  const tenantId = admin.user.tenantId;
  expect(tenantId, "tenant admin login must include tenantId").toBeTruthy();

  await request.patch(`${API_BASE}/admin/tenant-feature-flags/instapay`, {
    headers: h,
    data: { enabled: true },
  });

  const reception = await apiLogin(request, opts.receptionistEmail);
  const rh = authHeaders(reception.accessToken);

  const clinicsRes = await jsonOk<Array<{ id: string; nameEn: string }>>(
    await request.get(`${API_BASE}/clinics`, { headers: rh }),
  );
  const clinic = clinicsRes.find((c) => /heliopolis/i.test(c.nameEn)) ?? clinicsRes[0];
  expect(clinic).toBeTruthy();

  const patientsRes = await jsonOk<{ items: Array<{ id: string }> }>(
    await request.get(`${API_BASE}/patients?pageSize=5`, { headers: rh }),
  );
  expect(patientsRes.items.length).toBeGreaterThan(0);
  const patientIdx = Math.floor(Math.random() * Math.min(5, patientsRes.items.length));
  const patientId = patientsRes.items[patientIdx]!.id;

  const physicianSession = await apiLogin(request, opts.physicianEmail);
  const clinicianId = physicianSession.user.id;

  const fee = 350;
  const bookBody: Record<string, unknown> = {
    clinicId: clinic!.id,
    patientId,
    clinicianId,
    startsAt: isoSlotIn(90),
    feeAmount: fee,
    status: "CONFIRMED",
    bookingSource: opts.bookingSource ?? "FRONT_DESK",
  };
  if (opts.scheduledDeposit) {
    bookBody.scheduledFeeCollection = {
      mode: "MONEY_TRANSFER",
      transferChannel: "INSTAPAY",
    };
  }

  let appt: { id: string } | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const slotBody = { ...bookBody, startsAt: isoSlotIn(120 + attempt * 75) };
    const res = await request.post(`${API_BASE}/appointments`, { headers: rh, data: slotBody });
    if (res.ok()) {
      appt = (await res.json()) as { id: string };
      break;
    }
    const errText = await res.text();
    if (!/already has an appointment/i.test(errText)) {
      expect(res.ok(), errText).toBeTruthy();
    }
  }
  expect(appt, "could not book a free slot for clinician after retries").toBeTruthy();
  return { clinicId: clinic!.id, patientId, clinicianId, appointmentId: appt!.id, fee };
}

export async function runGoldenFlowViaApi(
  request: APIRequestContext,
  opts: GoldenFlowOptions,
): Promise<GoldenFlowResult> {
  const booked = await bookAppointmentViaApi(request, opts);
  const { patientId, clinicianId, fee } = booked;
  const clinic = { id: booked.clinicId };
  const rh = authHeaders((await apiLogin(request, opts.receptionistEmail)).accessToken);
  const physicianSession = await apiLogin(request, opts.physicianEmail);
  const adminEmail = opts.adminEmail ?? "admin@drahmedshall.com";
  const appointmentId = booked.appointmentId;

  const checkInBody: Record<string, unknown> = {
    paymentAmount: fee,
    currency: "EGP",
  };
  if (opts.checkInInstaPay !== false) {
    checkInBody.visitCollection = {
      mode: "MONEY_TRANSFER",
      transferChannel: "INSTAPAY",
      transferReference: `E2Einstapay${Date.now().toString().slice(-8)}`,
    };
  } else {
    checkInBody.visitCollection = { mode: "CASH_ON_VISIT" };
  }

  const checkIn = await jsonOk<{ openEncounterId?: string | null }>(
    await request.post(`${API_BASE}/front-desk/appointments/${appointmentId}/check-in`, {
      headers: rh,
      data: checkInBody,
    }),
  );
  expect(checkIn.openEncounterId).toBeTruthy();
  const encounterId = checkIn.openEncounterId!;

  const ph = authHeaders(physicianSession.accessToken);

  let drugProductId: string | undefined;
  let drugName = "Paracetamol 500mg tablets";
  for (const term of ["augment", "para", "amox", "a"]) {
    const drugs = await jsonOk<Array<{ id: string; brandNameEn: string }>>(
      await request.get(`${API_BASE}/clinical/drugs/search?q=${encodeURIComponent(term)}&limit=5`, {
        headers: ph,
      }),
    );
    if (drugs.length > 0) {
      drugProductId = drugs[0]!.id;
      drugName = drugs[0]!.brandNameEn;
      break;
    }
  }

  expect(drugProductId, "Egypt drug catalog should return at least one product in seed").toBeTruthy();

  await jsonOk(
    await request.post(`${API_BASE}/encounters/${encounterId}/medications`, {
      headers: ph,
      data: {
        drugName,
        drugProductId,
        dosage: "500mg",
        frequency: "twice daily",
        duration: "5 days",
      },
    }),
  );

  await jsonOk(await request.post(`${API_BASE}/encounters/${encounterId}/finalize`, { headers: ph }));

  const financeEmail = opts.financeEmail ?? adminEmail;
  const finance = await apiLogin(request, financeEmail);
  const fh = authHeaders(finance.accessToken);

  await jsonOk(
    await request.post(`${API_BASE}/billing/payments`, {
      headers: fh,
      data: {
        clinicId: clinic!.id,
        patientId,
        currency: "EGP",
        allocations: [
          { method: "CASH", amount: 120 },
          { method: "CARD", amount: 80 },
        ],
      },
    }),
  );

  const shiftDate = new Date().toISOString().slice(0, 10);
  await jsonOk(
    await request.post(`${API_BASE}/billing/cash-close`, {
      headers: fh,
      data: {
        clinicId: clinic!.id,
        shiftDate,
        countedCash: 120,
        countedCard: 80,
      },
    }),
  );

  const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const clinicTotals = await jsonOk<{ grossTotal: number }>(
    await request.get(
      `${API_BASE}/revenue/totals?from=${from}&to=${to}&clinicId=${encodeURIComponent(clinic!.id)}`,
      { headers: fh },
    ),
  );
  expect(clinicTotals.grossTotal, "posted revenue should include check-in and billing payments").toBeGreaterThan(0);

  return {
    clinicId: clinic!.id,
    patientId,
    clinicianId,
    appointmentId,
    encounterId,
  };
}

export async function assertDoctorRevenueUi(
  page: Page,
  physicianEmail: string,
  encounterId: string,
  financeEmail = "finance@drahmedshall.com",
): Promise<void> {
  const { login } = await import("./helpers");
  await login(page, physicianEmail);
  await page.goto(`/encounters/${encounterId}`);
  await expect(page.getByText(/finalized|منتهى/i).first()).toBeVisible({ timeout: 60_000 });

  await login(page, financeEmail);
  await page.goto("/revenue");
  await expect(page.locator("h1")).toContainText(/revenue|الإيرادات/i, { timeout: 60_000 });
}