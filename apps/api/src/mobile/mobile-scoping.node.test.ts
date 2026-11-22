import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UserRole } from "@prisma/client";
import { formatLocalYmd } from "../common/reporting-range";
import { MobileService, sha256 } from "./mobile.service";

const user = (role: UserRole, extra: Record<string, unknown> = {}) => ({ userId: "u1", tenantId: "t1", email: "e", role, ...extra });
/** MobileService with just enough stubbed to exercise endpoint scoping, the revenue calendar and the vitals idempotency key (no DB). */
function svc(opts: { edition?: string; profession?: string | null; totals?: (from: string, to: string) => unknown; recordVitals?: (...a: unknown[]) => unknown } = {}) {
  const prisma = {
    tenant: { findUniqueOrThrow: async () => ({ edition: opts.edition ?? "CLINIC", baseCurrency: "EGP" }) },
    user: { findUnique: async () => ({ profession: opts.profession ?? null }) },
    appointment: { count: async () => 0 },
    mobilePush: { findMany: async () => [] },
  };
  const revenue = { totals: async (_t: string, from: string, to: string) => (opts.totals ?? (() => ({ netTotal: 0, grossTotal: 0 })))(from, to) };
  const visits = { recordVitals: async (...a: unknown[]) => (opts.recordVitals ?? (() => ({ id: "v", critical: false, replayed: false })))(...a) };
  return new MobileService(prisma as never, {} as never, {} as never, { notifyUsers: async () => undefined } as never, {} as never, {} as never, visits as never, revenue as never, {} as never);
}
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return (e as { getResponse?: () => { code?: string } }).getResponse?.().code ?? "ERR"; } };

describe("Kiorly Team: endpoint role scoping matches the module a role gets", () => {
  it("accountant, front desk and call centre cannot read prescriptions or lab results; accountant cannot search patients", async () => {
    for (const role of [UserRole.FINANCE_OFFICER, UserRole.RECEPTIONIST, UserRole.CALL_CENTER]) {
      assert.equal(await code(() => svc().prescriptions(user(role) as never)), "MODULE_NOT_ALLOWED", `${role} prescriptions`);
      assert.equal(await code(() => svc().labResults(user(role) as never)), "MODULE_NOT_ALLOWED", `${role} labs`);
    }
    assert.equal(await code(() => svc().search(user(UserRole.FINANCE_OFFICER) as never, "ahmed")), "MODULE_NOT_ALLOWED");
  });
  it("a nurse (profession NURSE) cannot list prescriptions, even with the PHYSICIAN role (Nurse edition)", async () => {
    assert.equal(await code(() => svc({ edition: "NURSE", profession: "NURSE" }).prescriptions(user(UserRole.PHYSICIAN) as never)), "MODULE_NOT_ALLOWED");
    assert.equal(await code(() => svc().prescriptions(user(UserRole.NURSE) as never)), "MODULE_NOT_ALLOWED");
  });
});

describe("Kiorly Team: revenue snapshot uses the web ledger calendar", () => {
  it("asks the ledger for server-local YYYY-MM-DD days (same as /revenue/totals), 7 daily + 30-day window", async () => {
    const asked: [string, string][] = [];
    const s = svc({ totals: (from, to) => { asked.push([from, to]); return { netTotal: 10, grossTotal: 12 }; } });
    const r = await s.revenueSnapshot(user(UserRole.FINANCE_OFFICER) as never);
    assert.equal(r.today.date, formatLocalYmd(new Date()));
    assert.equal(asked.length, 8);
    assert.deepEqual(asked[6], [formatLocalYmd(new Date()), formatLocalYmd(new Date())]);
    assert.equal(r.last7.net, 70);
    assert.equal(r.last30.net, 10);
  });
});

describe("Kiorly Team: vitals are idempotent per Idempotency-Key (offline replay)", () => {
  it("derives a stable row id from tenant + user + key, and not from other keys or users", async () => {
    const ids: unknown[] = [];
    const s = svc({ recordVitals: (...a) => { ids.push((a[5] as { id?: string })?.id); return { id: "v", critical: false, replayed: false }; } });
    const nurse = user(UserRole.NURSE);
    await s.recordVitals(nurse as never, { patientId: "p", pulse: 70 }, "k-1");
    await s.recordVitals(nurse as never, { patientId: "p", pulse: 70 }, "k-1");
    await s.recordVitals(nurse as never, { patientId: "p", pulse: 70 }, "k-2");
    await s.recordVitals({ ...nurse, userId: "u2" } as never, { patientId: "p", pulse: 70 }, "k-1");
    await s.recordVitals(nurse as never, { patientId: "p", pulse: 70 });
    assert.equal(ids[0], ids[1]);
    assert.equal(ids[0], `vit_idem_${sha256("t1|u1|k-1").slice(0, 32)}`);
    assert.equal(new Set([ids[0], ids[2], ids[3]]).size, 3);
    assert.equal(ids[4], undefined);
  });
  it("does not push a critical notification again for a replay", async () => {
    let pushed = 0;
    const prisma = { tenant: { findUniqueOrThrow: async () => ({}) }, user: { findMany: async () => [] } };
    const push = { notifyUsers: async () => { pushed++; } };
    const visits = { recordVitals: async () => ({ id: "v", critical: true, replayed: true }) };
    const s = new MobileService(prisma as never, {} as never, {} as never, push as never, {} as never, {} as never, visits as never, {} as never, {} as never);
    await s.recordVitals(user(UserRole.NURSE) as never, { patientId: "p", systolic: 230 }, "k");
    assert.equal(pushed, 0);
  });
});
