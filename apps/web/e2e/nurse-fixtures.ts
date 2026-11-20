import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Kiorly Nurse E2E fixtures (Q7). Test-only: data is created directly in the dev database (unique per run, tagged "E2E Nurse") and through the
 * real API; the demo nurse tenants come from `npm run db:seed:nurse -w api` (+ the data agent's extension), password `Demo@12345`.
 */
const HERE = import.meta.dirname ?? join(fileURLToPath(import.meta.url), "..");
const require = createRequire(join(HERE, "../../api/package.json"));
const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(HERE, "../../api/.env"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found");
  const raw = line.slice("DATABASE_URL=".length).replace(/"/g, "");
  return `${raw}${raw.includes("?") ? "&" : "?"}connection_limit=2`;
}

export const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
export const PASSWORD = process.env.NURSE_DEMO_PASSWORD ?? "Demo@12345";
export const SOLO_EMAIL = "mona@nurse-demo.kiorly.test";
export const AGENCY = { owner: "owner@nurse-demo.kiorly.test", dispatcher: "dispatch@nurse-demo.kiorly.test", nurse1: "nurse1@nurse-demo.kiorly.test", nurse2: "nurse2@nurse-demo.kiorly.test", aide: "aide@nurse-demo.kiorly.test" };

export function apiBase(baseURL: string): string {
  return `${new URL(baseURL).origin}/api/v1`;
}

export async function apiLogin(request: APIRequestContext, baseURL: string, email: string): Promise<string> {
  const res = await request.post(`${apiBase(baseURL)}/auth/login`, { data: { email, password: PASSWORD } });
  if (!res.ok()) throw new Error(`login ${email} -> ${res.status()} ${await res.text()}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export async function uiLogin(page: Page, email: string): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.removeItem("cms-auth"); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#email").waitFor({ state: "visible", timeout: 60_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  const post = page.waitForResponse((r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /^(sign in|تسجيل الدخول)$/i }).click();
  const res = await post;
  if (!res.ok()) throw new Error(`UI login ${email}: ${res.status()}`);
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60_000, waitUntil: "commit" });
}

export async function tenantOf(email: string) {
  const u = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true, tenantId: true } });
  const clinic = await prisma.clinic.findFirstOrThrow({ where: { tenantId: u.tenantId! }, select: { id: true } });
  return { userId: u.id, tenantId: u.tenantId!, clinicId: clinic.id };
}

export async function verifyNurse(email: string): Promise<void> {
  const u = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true, tenantId: true } });
  await prisma.clinicianVerification.upsert({
    where: { userId: u.id },
    create: { userId: u.id, tenantId: u.tenantId!, status: "VERIFIED", verifiedProfession: "NURSE", profession: "NURSE", syndicateNumber: `E2E-${u.id.slice(-6)}`, documentKeys: [] },
    update: { status: "VERIFIED", verifiedProfession: "NURSE", profession: "NURSE" },
  });
}

export async function unverifyNurse(email: string): Promise<void> {
  const u = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true } });
  await prisma.clinicianVerification.deleteMany({ where: { userId: u.id } });
}

export async function ensureHomeSettings(tenantId: string, clinicianId: string): Promise<void> {
  const districts = ["nasr-city", "heliopolis"];
  await prisma.clinicianHomeSettings.upsert({
    where: { tenantId_clinicianId: { tenantId, clinicianId } },
    create: { tenantId, clinicianId, acceptsHomeVisits: true, coverageDistrictIds: districts },
    update: { acceptsHomeVisits: true, coverageDistrictIds: districts, dailyVisitCap: null, homeHoursJson: undefined, restrictToPatientGender: null },
  });
}

let counter = 0;
export async function createPatient(tenantId: string, label: string, opts: { allergy?: "PENICILLIN" | "ASPIRIN" } = {}) {
  const tag = `${Date.now()}${++counter}`.slice(-9);
  const home = await prisma.clinic.findFirst({ where: { tenantId }, select: { id: true } });
  const patient = await prisma.patient.create({ data: { tenantId, homeBranchId: home?.id, mrn: `E2E-${tag}`, firstNameEn: `E2E ${label}`, lastNameEn: `Patient ${tag}`, gender: "F", phone: `+2010${tag.padStart(8, "0").slice(-8)}` } });
  if (opts.allergy) await prisma.patientAllergy.create({ data: { tenantId, patientId: patient.id, code: opts.allergy } });
  return patient;
}

/** Cancels any live home visits of this nurse for today so a fresh booking never collides with leftovers from earlier runs. */
export async function clearToday(tenantId: string, clinicianId: string): Promise<void> {
  const from = new Date(Date.now() - 12 * 3600_000);
  const to = new Date(Date.now() + 36 * 3600_000);
  const visits = await prisma.homeVisit.findMany({ where: { tenantId, clinicianId, plannedStartsAt: { gte: from, lt: to }, state: { in: ["REQUESTED", "CONFIRMED", "ON_MY_WAY", "ARRIVED"] } }, select: { id: true, appointmentId: true } });
  for (const v of visits) {
    await prisma.homeVisit.update({ where: { id: v.id }, data: { state: "CANCELLED" } });
    await prisma.appointment.update({ where: { id: v.appointmentId }, data: { status: "CANCELLED" } });
  }
}

/** A deposit on the type satisfies the first-home-visit safeguard (HVSAF03) for front-desk bookings. */
export async function homeType(tenantId: string): Promise<{ id: string; nameEn: string }> {
  const t = await prisma.appointmentType.findFirstOrThrow({ where: { tenantId, serviceLocation: "HOME", isActive: true }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true } });
  await prisma.appointmentType.update({ where: { id: t.id }, data: { depositAmount: 50, minNoticeMinutes: 0, maxDaysAhead: 90 } });
  return t;
}

export async function bookHomeVisit(request: APIRequestContext, baseURL: string, token: string, input: { clinicId: string; patientId: string; clinicianId: string; typeId: string; minutesFromNow: number; district?: string }) {
  const start = new Date(Date.now() + input.minutesFromNow * 60_000);
  start.setSeconds(0, 0);
  const res = await request.post(`${apiBase(baseURL)}/home-visits/bookings`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { clinicId: input.clinicId, patientId: input.patientId, clinicianId: input.clinicianId, appointmentTypeId: input.typeId, startsAt: start.toISOString(), visitAddress: { district: input.district ?? "nasr-city", line1: "12 E2E Street", building: "4", floor: "2", flat: "5" }, addressConfirmed: true },
  });
  if (!res.ok()) throw new Error(`booking -> ${res.status()} ${await res.text()}`);
  return (await res.json()) as { id?: string; homeVisitId?: string; appointmentId?: string };
}

export async function visitOf(patientId: string) {
  return prisma.homeVisit.findFirstOrThrow({ where: { patientId }, orderBy: { createdAt: "desc" }, select: { id: true, state: true, appointmentId: true, clinicianId: true } });
}
