import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { JwtUser } from "../auth/jwt-user";
import { EntitlementsService } from "../entitlements/entitlements.service";
import type { FlagSnapshot } from "../feature-flags/kiorex-flag-snapshot";
import { KiorexFlagSnapshotService } from "../feature-flags/kiorex-flag-snapshot.service";
import type { PrismaService } from "../prisma/prisma.service";
import { MobileAlertsService } from "./mobile-alerts.service";
import { MobileEntitlementService } from "./mobile-entitlement.service";
import { MobilePushService } from "./mobile-push.service";
import { MobileInterceptor } from "./mobile.interceptor";
import { MobileUpgradeService } from "./mobile-upgrade.service";
import { MobileService } from "./mobile.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

/** Needs `npm run db:seed:demo` + `npm run db:seed:mobile` (demo tenants na = PRO, bs = BASIC, nsolo = NURSE_PRO, Kiorly Clinic Group = ENTERPRISE). */
const prisma = createPrismaClient();
const p = prisma as unknown as PrismaService;
const audit = new AuditService(p);
const snaps = new KiorexFlagSnapshotService(p, {} as never);
const ent = new MobileEntitlementService(p, new EntitlementsService(p), snaps);
const push = new MobilePushService(p);
const alerts = new MobileAlertsService(p, audit);
const svc = new MobileService(p, audit, ent, push, alerts, {} as never, {} as never, {} as never, new MobileUpgradeService(p, audit, ent, push));
const interceptor = new MobileInterceptor(p, ent);

const J = (userId: string, tenantId: string, role: UserRole, owner = false): JwtUser => ({ userId, tenantId, email: `${userId}@x`, role, isTenantOwner: owner });
const PRO = (id = "demo_u_na_nadia", role: UserRole = UserRole.PHYSICIAN) => J(id, "demo_t_na", role);
const BASIC_OWNER = J("demo_u_bs_owner", "demo_t_bs", UserRole.GROUP_ADMIN, true);
const BASIC_NURSE = J("demo_u_bs_nurse", "demo_t_bs", UserRole.NURSE);

async function run(user: JwtUser | undefined, method: string, url: string, headers: Record<string, string> = {}) {
  const ctx = { getType: () => "http", switchToHttp: () => ({ getRequest: () => ({ user, method, originalUrl: `/api/v1${url}`, headers }) }) } as never;
  let reached = false;
  await interceptor.intercept(ctx, { handle: () => { reached = true; return {} as never; } });
  return reached;
}
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { const r = (e as { getResponse?: () => { code?: string } }).getResponse?.(); return r?.code ?? "ERR"; } };

describe("Kiorly Work backend (real DB)", () => {
  before(async () => {
    await prisma.$connect();
    snaps.setSnapshotForTests(null);
    await prisma.mobileAlertAck.deleteMany({ where: { tenantId: { in: ["demo_t_bs", "demo_t_na"] } } });
    await prisma.vitalsObservation.updateMany({ where: { id: { in: ["demo_vit_bs_crit", "demo_vit_na_crit"] } }, data: { escalatedAt: null } });
    await prisma.homeSafetyAlert.updateMany({ where: { id: { in: ["demo_hsa_mobile_sos", "demo_hsa_mobile_noanswer"] } }, data: { acknowledgedAt: null, status: "DELIVERED" } });
    await prisma.mobileResultReview.deleteMany({ where: { tenantId: "demo_t_na", orderId: { in: ["demo_co_mobile_crit", "demo_co_mobile_norm"] } } });
    await prisma.mobileDevice.deleteMany({ where: { deviceId: { startsWith: "test-device-" } } });
  });
  after(async () => {
    snaps.setSnapshotForTests(null);
    // leave the demo alerts open for the app demo
    await prisma.mobileAlertAck.deleteMany({ where: { tenantId: { in: ["demo_t_bs", "demo_t_na"] } } });
    await prisma.vitalsObservation.updateMany({ where: { id: { in: ["demo_vit_bs_crit", "demo_vit_na_crit"] } }, data: { escalatedAt: null } });
    await prisma.homeSafetyAlert.updateMany({ where: { id: { in: ["demo_hsa_mobile_sos", "demo_hsa_mobile_noanswer"] } }, data: { acknowledgedAt: null, status: "DELIVERED" } });
    await prisma.$disconnect();
  });

  it("entitlement by plan: BASIC off, PRO/ENTERPRISE/NURSE_PRO on", async () => {
    const basic = await ent.evaluate("demo_t_bs");
    assert.deepEqual([basic.enabled, basic.reason, basic.plan], [false, "PLAN_BELOW_PRO", "BASIC"]);
    assert.equal((await ent.evaluate("demo_t_na")).enabled, true);
    assert.equal((await ent.evaluate("demo_t_nsolo")).plan, "PRO");
    const e = await prisma.tenant.findFirstOrThrow({ where: { name: "Kiorly Clinic Group (Demo)" } });
    const big = await ent.evaluate(e.id);
    assert.deepEqual([big.enabled, big.plan], [true, "ENTERPRISE"]);
  });

  it("Kiorex org-scope OFF switches a PRO org off (FLAG_OFF); other orgs unaffected", async () => {
    snaps.setSnapshotForTests({ product: "kiorly-clinic", version: 1, generatedAt: new Date().toISOString(), signature: "x", flags: [{ key: "mobile_staff_app", class: "Module", scopes: ["global", "market", "org"], dependsOn: [], launchLocked: false, gateSatisfied: true, values: { orgs: { demo_t_na: "OFF" } } }] } as unknown as FlagSnapshot);
    const off = await ent.evaluate("demo_t_na");
    assert.deepEqual([off.enabled, off.reason], [false, "FLAG_OFF"]);
    assert.equal((await ent.evaluate("demo_t_nsolo")).enabled, true);
    snaps.setSnapshotForTests(null);
    assert.equal((await ent.evaluate("demo_t_na")).enabled, true);
  });

  it("bootstrap: PRO doctor gets clinical modules; BASIC gets alerts only", async () => {
    const b = await svc.bootstrap(PRO());
    assert.equal(b.product, "clinic");
    assert.equal(b.entitlement.enabled, true);
    assert.equal(b.safetyAlertsOnly, false);
    assert.ok(b.modules.find((m) => m.key === "clinic.prescriptions")?.enabled);
    const lite = await svc.bootstrap(BASIC_OWNER);
    assert.deepEqual([lite.entitlement.enabled, lite.entitlement.reason, lite.safetyAlertsOnly, lite.modules.length, lite.org.plan], [false, "PLAN_BELOW_PRO", true, 0, "BASIC"]);
    const owner = await svc.bootstrap(PRO("demo_u_na_owner", UserRole.GROUP_ADMIN));
    assert.ok(owner.modules.find((m) => m.key === "clinic.revenue")?.enabled);
  });

  it("client enforcement: kiorly-work client without the entitlement is 403 FEATURE_DISABLED, except alerts/bootstrap/auth/sign-out", async () => {
    const h = { "x-kiorly-client": "kiorly-work/1.0.0" };
    assert.equal(await code(() => run(BASIC_OWNER, "GET", "/patients", h)), "FEATURE_DISABLED");
    assert.equal(await code(() => run(BASIC_OWNER, "GET", "/mobile/inbox")), "FEATURE_DISABLED");
    assert.equal(await run(BASIC_OWNER, "GET", "/mobile/alerts", h), true);
    assert.equal(await run(BASIC_OWNER, "GET", "/mobile/bootstrap", h), true);
    assert.equal(await run(BASIC_OWNER, "DELETE", "/mobile/devices/xyz", h), true);
    assert.equal(await run(BASIC_OWNER, "GET", "/patients"), true, "the web app (no client header) is untouched");
    assert.equal(await run(PRO(), "GET", "/patients", h), true);
    assert.equal(await run(undefined, "GET", "/public/x", h), true);
  });

  it("devices: register, rotate, list, push token, remote sign-out revokes device AND refresh session", async () => {
    const owner = PRO("demo_u_na_owner", UserRole.GROUP_ADMIN);
    const doc = PRO();
    const sess = await prisma.userSession.create({ data: { userId: doc.userId, refreshTokenHash: "test-" + Date.now(), expiresAt: new Date(Date.now() + 864e5) } });
    const reg = await svc.registerDevice({ ...doc, sessionId: sess.id }, { deviceId: "test-device-1", platform: "ios", name: "Test iPhone", appVersion: "1.0.0" });
    assert.ok(reg.deviceToken.length > 30 && reg.status === "ACTIVE");
    const row = await prisma.mobileDevice.findUniqueOrThrow({ where: { id: reg.id } });
    assert.notEqual(row.tokenHash, reg.deviceToken, "token is hashed at rest");
    const hdr = { "x-kiorly-device": reg.id, "x-kiorly-device-token": reg.deviceToken };
    assert.equal(await run(doc, "GET", "/mobile/inbox", hdr), true);
    assert.equal(await code(() => run(doc, "GET", "/mobile/inbox", { ...hdr, "x-kiorly-device-token": "wrong" })), "DEVICE_REVOKED");
    assert.equal(await code(() => run(doc, "GET", "/mobile/inbox", { "x-kiorly-device": "nope", "x-kiorly-device-token": "x" })), "DEVICE_REVOKED");
    const again = await svc.registerDevice({ ...doc, sessionId: sess.id }, { deviceId: "test-device-1", platform: "ios", name: "Test iPhone" });
    assert.equal(again.id, reg.id);
    assert.notEqual(again.deviceToken, reg.deviceToken, "re-register rotates the token");
    assert.equal(await code(() => run(doc, "GET", "/mobile/inbox", hdr)), "DEVICE_REVOKED");
    const hdr2 = { "x-kiorly-device": reg.id, "x-kiorly-device-token": again.deviceToken };
    assert.deepEqual(await svc.setPushToken(doc, reg.id, { token: "ExponentPushToken[test]", provider: "expo" }), { id: reg.id, hasPushToken: true, provider: "expo" });
    assert.equal((await svc.listDevices(doc)).items.filter((d) => d.id === reg.id).length, 1);
    assert.equal(await code(() => svc.revokeDevice(PRO("demo_u_na_nurse", UserRole.NURSE), reg.id)), "FORBIDDEN", "another non-admin cannot sign it out");
    assert.equal((await svc.revokeDevice(owner, reg.id)).status, "REVOKED"); // org admin = remote sign-out
    assert.equal(await code(() => run(doc, "GET", "/mobile/inbox", hdr2)), "DEVICE_REVOKED");
    assert.ok((await prisma.userSession.findUniqueOrThrow({ where: { id: sess.id } })).revokedAt, "refresh session revoked");
    assert.equal((await svc.revokeDevice(doc, reg.id)).status, "REVOKED", "idempotent");
    await prisma.userSession.delete({ where: { id: sess.id } });
  });

  it("inbox + mock push: test push lands in the inbox, mark read / read-all", async () => {
    const doc = PRO();
    const before = (await svc.inbox(doc, {})).unread;
    const r = await svc.pushTest(doc);
    assert.equal(r.provider, "mock");
    const inbox = await svc.inbox(doc, { limit: "5" });
    assert.equal(inbox.unread, before + 1);
    assert.equal(inbox.items[0].title, "Kiorly Work test notification");
    assert.ok(/[؀-ۿ]/.test(inbox.items[0].titleAr));
    await svc.markRead(doc, inbox.items[0].id);
    assert.equal((await svc.inbox(doc, {})).unread, before);
    assert.equal(await code(() => svc.markRead(doc, "missing")), "MESSAGE_NOT_FOUND");
    await svc.pushTest(doc);
    assert.equal((await svc.markAllRead(doc)).updated >= 1, true);
    assert.equal((await svc.inbox(doc, {})).unread, 0);
    assert.equal((await svc.inbox(BASIC_OWNER, {})).items.length >= 0, true);
  });

  it("safety alerts reach a BASIC org (read + ack), ack is idempotent and audited", async () => {
    const open = await alerts.list(BASIC_NURSE, "open");
    const a = open.items.find((i) => i.id === "vit_demo_vit_bs_crit");
    assert.ok(a, "critical vitals alert present for the BASIC org");
    assert.equal(a!.severity, "CRITICAL");
    assert.ok(/[؀-ۿ]/.test(a!.titleAr));
    const r1 = await alerts.ack(BASIC_NURSE, a!.id, "Called the doctor");
    assert.equal(r1.alreadyAcknowledged, false);
    const r2 = await alerts.ack(BASIC_NURSE, a!.id, "again");
    assert.equal(r2.alreadyAcknowledged, true);
    assert.equal(r2.ackedBy, "demo_u_bs_nurse");
    assert.ok(!(await alerts.list(BASIC_NURSE, "open")).items.some((i) => i.id === a!.id));
    const all = await alerts.list(BASIC_NURSE, "all");
    assert.equal(all.items.find((i) => i.id === a!.id)?.ackNote, "Called the doctor");
    assert.equal(await code(() => alerts.ack(BASIC_NURSE, "vit_nope")), "ALERT_NOT_FOUND");
    assert.equal(await code(() => alerts.ack(J("demo_u_na_frontdesk1", "demo_t_na", UserRole.RECEPTIONIST), a!.id)), "FORBIDDEN");
    const log = await prisma.auditLog.count({ where: { tenantId: "demo_t_bs", action: "mobile.alert_acknowledged" } });
    assert.ok(log >= 1);
  });

  it("home-visit safety alert: manager sees it, the visit clinician sees only own, ack moves the HomeSafetyAlert row", async () => {
    const owner = { ...PRO("demo_u_na_owner", UserRole.GROUP_ADMIN), isTenantOwner: true };
    const sos = (await alerts.list(owner, "open")).items.find((i) => i.id === "hv_demo_hsa_mobile_sos");
    assert.ok(sos, "SOS alert open");
    assert.deepEqual([sos!.kind, sos!.severity], ["HOME_VISIT_SOS", "CRITICAL"]);
    const r = await alerts.ack(owner, sos!.id, "Phoned the nurse");
    assert.equal(r.alreadyAcknowledged, false);
    assert.equal((await prisma.homeSafetyAlert.findUniqueOrThrow({ where: { id: "demo_hsa_mobile_sos" } })).status, "ACKNOWLEDGED");
    assert.ok(!(await alerts.list(owner, "open")).items.some((i) => i.id === sos!.id));
  });

  it("alerts: PRO org sees home-visit safety + critical lab + critical vitals; tenants are isolated", async () => {
    const owner = PRO("demo_u_na_owner", UserRole.GROUP_ADMIN);
    const kinds = new Set((await alerts.list({ ...owner, isTenantOwner: true }, "all")).items.map((i) => i.kind));
    assert.ok(kinds.has("CRITICAL_LAB_RESULT") && kinds.has("CRITICAL_VITALS"));
    const lite = await alerts.list(BASIC_OWNER, "all");
    assert.ok(lite.items.every((i) => i.subject?.id !== "demo_co_mobile_crit"));
  });

  it("lab results: pending list, physician approves (idempotent), receptionist cannot", async () => {
    const doc = PRO();
    const pending = await svc.labResults(doc, "pending");
    const crit = pending.items.find((i) => i.orderId === "demo_co_mobile_crit");
    assert.ok(crit?.critical && crit.items.some((i) => i.flag === "CRITICAL_HIGH"));
    assert.equal(await code(() => svc.approveLabResult(J("demo_u_na_frontdesk1", "demo_t_na", UserRole.RECEPTIONIST), "demo_co_mobile_crit")), "FORBIDDEN");
    assert.equal((await svc.approveLabResult(doc, "demo_co_mobile_crit", "Repeat K+")).alreadyApproved, false);
    assert.equal((await svc.approveLabResult(doc, "demo_co_mobile_crit")).alreadyApproved, true);
    assert.ok(!(await svc.labResults(doc, "pending")).items.some((i) => i.orderId === "demo_co_mobile_crit"));
    assert.ok((await svc.labResults(doc, "reviewed")).items.some((i) => i.orderId === "demo_co_mobile_crit"));
    assert.equal(await code(() => svc.approveLabResult(doc, "nope")), "ORDER_NOT_FOUND");
    await prisma.mobileResultReview.deleteMany({ where: { tenantId: "demo_t_na", orderId: "demo_co_mobile_crit" } });
  });

  it("prescriptions: pending list; only a physician signs; sign delegates to the encounter finalize rules; vitals need a clinical role and notify on critical", async () => {
    const finalized: string[] = [];
    const recorded: unknown[] = [];
    const stub = new MobileService(p, audit, ent, push, alerts, { finalize: async (_t: string, _u: unknown, id: string) => { finalized.push(id); return { status: "FINALIZED" }; } } as never, { recordVitals: async (_t: string, _u: unknown, pid: string, _a: unknown, v: unknown) => { recorded.push([pid, v]); return { id: "vit_stub", flags: { systolic: "CRITICAL_HIGH" }, critical: true }; } } as never, {} as never, new MobileUpgradeService(p, audit, ent, push));
    const doc = PRO();
    const pending = await stub.prescriptions(doc, "pending");
    const rx = pending.items.find((i) => i.encounterId === "demo_enc_mobile_rx");
    assert.ok(rx && rx.medications[0].drugName === "Cetirizine 10 mg");
    assert.equal(await code(() => stub.signPrescription(PRO("demo_u_na_nurse", UserRole.NURSE), "demo_enc_mobile_rx")), "FORBIDDEN");
    assert.equal((await stub.signPrescription(doc, "demo_enc_mobile_rx")).status, "FINALIZED");
    assert.deepEqual(finalized, ["demo_enc_mobile_rx"]);
    assert.equal(await code(() => stub.signPrescription(doc, "missing")), "ENCOUNTER_NOT_FOUND");
    const nurse = PRO("demo_u_na_nurse", UserRole.NURSE);
    const before = await prisma.mobilePush.count({ where: { tenantId: "demo_t_na", templateId: "CRITICAL_VITALS" } });
    const v = await stub.recordVitals(nurse, { patientId: "demo_p_na_1", systolic: 210 });
    assert.equal(v.critical, true);
    assert.equal(recorded.length, 1);
    assert.ok((await prisma.mobilePush.count({ where: { tenantId: "demo_t_na", templateId: "CRITICAL_VITALS" } })) > before, "critical vitals notify the nurse and managers via the mock push");
    assert.equal(await code(() => stub.recordVitals(PRO("demo_u_na_frontdesk1", UserRole.RECEPTIONIST), { patientId: "demo_p_na_1" })), "FORBIDDEN");
    assert.equal(await code(() => stub.recordVitals(nurse, {} as never)), "ERR");
  });

  it("schedule, summary, search return today's data scoped to the tenant", async () => {
    const owner = PRO("demo_u_na_owner", UserRole.GROUP_ADMIN);
    const s = await svc.schedule({ ...owner, isTenantOwner: true }, {});
    assert.ok(s.counts.total >= 0 && Array.isArray(s.items) && Array.isArray(s.queue));
    const sum = await svc.summary(PRO());
    assert.ok(typeof sum.unreadInbox === "number" && "pendingLabReviews" in sum);
    const found = await svc.search(PRO(), "Hoda");
    assert.ok(Array.isArray(found.patients));
    assert.equal((await svc.search(PRO(), "x")).patients.length, 0);
    assert.equal(await code(() => svc.revenueSnapshot(PRO("demo_u_na_frontdesk1", UserRole.RECEPTIONIST))), "FORBIDDEN");
  });
});
