import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, BookingSource, CommissionChargeStatus, CommissionDecisionKind, CommissionDisputeReason, CommissionDisputeStatus } from "@prisma/client";
import { createWorld, prisma, type World } from "../growth/growth-test-kit.test";
import { signLinkTouch } from "../growth/provider-links/link-touch";
import { COMMISSION_ADJUSTED, COMMISSION_CHARGE_CREATED, COMMISSION_CHARGE_REVERSED } from "./commission-charge-topics";
import { writeCommissionDecision } from "./commission-decision";
import examples from "../growth/fixtures/acquisition-examples.json";

const HASH = "a".repeat(64);
const block = (o: "PROVIDER_LED" | "MARKETPLACE" | "UNATTRIBUTED", extra: Record<string, unknown> = {}) => ({ origin: o, decisionId: `kx_ad_${o}`, policyVersion: "kx_policy_v7", reason: o === "PROVIDER_LED" ? "EXPLICIT_PROVIDER_CHANNEL" : "MARKETPLACE_TOUCH", evidenceHash: HASH, touch: { kind: "ORGANIC_SEARCH", ref: "t1", at: "2026-11-24T10:00:00Z" }, ...extra });
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    const r = (e as { getResponse?: () => { code?: string } }).getResponse?.();
    return r?.code ?? String((e as { status?: number }).status ?? e);
  }
};

describe("GRW-P1-D2 commission attribution intake, decisions, disputes, reconciliation (real Postgres)", () => {
  let w: World;
  let day = 0;
  const slot = () => new Date(Date.UTC(2027, 2, 1, 6) + day++ * 2 * 3_600_000).toISOString();
  before(async () => {
    w = await createWorld("d2");
  });
  after(async () => {
    await w.cleanup();
  });
  const A = () => ({ clinicId: w.A.clinicId, doc: w.A.doc, typeId: w.A.typeId });
  const decisionsOf = (appointmentId: string) => prisma.kiorexCommissionDecision.findMany({ where: { appointmentId }, orderBy: { createdAt: "asc" } });

  it("absent acquisition block: UNATTRIBUTED, today's rules, one CHARGE decision that explains itself", async () => {
    const b = await w.book(A(), slot());
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
    assert.equal(row.acquisitionOrigin, "UNATTRIBUTED");
    assert.equal(row.acquisitionDecisionRef, null);
    await w.checkIn(w.A.tenantId, row.id, new Date());
    const charge = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: row.id } });
    assert.equal(charge.amount.toFixed(2), "40.00");
    const [d, ...rest] = await decisionsOf(row.id);
    assert.equal(rest.length, 0);
    assert.deepEqual([d!.decision, d!.origin, d!.reasonCodes, d!.amount?.toFixed(2), d!.rateId], ["CHARGE", "UNATTRIBUTED", ["KIOREX_NEW_PATIENT", "UNATTRIBUTED_TREATED_AS_MARKETPLACE"], "40.00", w.rateId]);
    assert.match(d!.inputsHash, /^[0-9a-f]{64}$/);
    assert.match(d!.policyVersion, /^CP1@2020-01-01$/);
    // the charge event carries the additive contract fields
    const ev = await prisma.outboxEvent.findFirst({ where: { tenantId: w.A.tenantId, type: COMMISSION_CHARGE_CREATED, aggregateId: row.id } });
    assert.deepEqual([(ev!.payload as Record<string, unknown>).decisionRef, (ev!.payload as Record<string, unknown>).origin, (ev!.payload as Record<string, unknown>).policyVersion], [d!.id, "UNATTRIBUTED", d!.policyVersion]);
  });

  it("MARKETPLACE block is stored and frozen at booking; the fee applies exactly as before", async () => {
    const key = `FREEZE-${w.suffix}`;
    const b = await w.book(A(), slot(), { acquisition: block("MARKETPLACE") }, key);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
    assert.deepEqual([row.acquisitionOrigin, row.acquisitionDecisionRef, row.acquisitionPolicyVersion], ["MARKETPLACE", "kx_ad_MARKETPLACE", "kx_policy_v7"]);
    assert.deepEqual((row.attributionJson as { acquisition: { reason: string; evidenceHash: string } }).acquisition, { reason: "MARKETPLACE_TOUCH", evidenceHash: HASH, touch: { kind: "ORGANIC_SEARCH", ref: "t1", at: "2026-11-24T10:00:00Z" } });
    // a retry with the same key and a DIFFERENT block returns the same appointment and changes nothing (freeze)
    const again = await w.book(A(), slot(), { acquisition: block("PROVIDER_LED") }, key);
    assert.equal(again.appointmentId, b.appointmentId);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } })).acquisitionOrigin, "MARKETPLACE");
    await w.checkIn(w.A.tenantId, row.id, new Date());
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: row.id } })).amount.toFixed(2), "40.00");
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: row.id } })).acquisitionDecisionRef, "kx_ad_MARKETPLACE", "check-in never rewrites the frozen fields");
  });

  it("PROVIDER_LED on a marketplace booking: no KiorexCommissionCharge, exactly one decision that says why", async () => {
    const b = await w.book(A(), slot(), { acquisition: block("PROVIDER_LED") });
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
    assert.equal(row.bookingSource, BookingSource.KIOREX_MARKETPLACE);
    assert.equal(row.acquisitionOrigin, "PROVIDER_LED");
    await w.checkIn(w.A.tenantId, row.id, new Date());
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: row.id } }), 0);
    const ds = await decisionsOf(row.id);
    assert.equal(ds.length, 1);
    assert.deepEqual([ds[0]!.decision, ds[0]!.reasonCodes, ds[0]!.amount, ds[0]!.rateId], ["NO_CHARGE", ["PROVIDER_LED"], null, null]);
    const explained = await w.svc.decisions.explain(w.A.admin, row.id);
    assert.match(explained.items[0]!.explanation, /^No fee\. The patient booked through your own link or widget/);
    // statuses events carry the origin
    const ev = await prisma.outboxEvent.findFirst({ where: { tenantId: w.A.tenantId, type: "APPOINTMENT_CONFIRMED", aggregateId: row.id } });
    assert.equal((ev!.payload as Record<string, unknown>).acquisitionOrigin, "PROVIDER_LED");
  });

  it("rejects a malformed block with the contract's codes and creates nothing", async () => {
    const before = await prisma.appointment.count({ where: { tenantId: w.A.tenantId } });
    assert.equal(await codeOf(w.book(A(), slot(), { acquisition: { origin: "BOGUS" } })), "ACQUISITION_BLOCK_INVALID");
    assert.equal(await codeOf(w.book(A(), slot(), { acquisition: "yes" })), "ACQUISITION_BLOCK_INVALID");
    assert.equal(await codeOf(w.book(A(), slot(), { acquisition: block("MARKETPLACE", { evidenceHash: "XYZ" }) })), "ACQUISITION_EVIDENCE_HASH_INVALID");
    assert.equal(await codeOf(w.book(A(), slot(), { acquisition: block("MARKETPLACE", { evidenceHash: "A".repeat(64) }) })), "ACQUISITION_EVIDENCE_HASH_INVALID", "uppercase hex is not the contract format");
    assert.equal(await prisma.appointment.count({ where: { tenantId: w.A.tenantId } }), before);
  });

  it("contract fixtures from kiorex-contracts 1.10.0: every valid example is accepted and stored, every invalid one is a 400 with a contract code", async () => {
    for (const [name, ex] of Object.entries(examples.valid)) {
      const b = await w.book(A(), slot(), { acquisition: ex });
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
      assert.deepEqual([row.acquisitionOrigin, row.acquisitionDecisionRef, row.acquisitionPolicyVersion], [ex.origin === "PROVIDER_LED" ? "PROVIDER_LED" : ex.origin, ex.decisionId, ex.policyVersion], name);
    }
    for (const [name, ex] of Object.entries(examples.invalid)) {
      assert.match(await codeOf(w.book(A(), slot(), { acquisition: ex })), /^ACQUISITION_(BLOCK_INVALID|EVIDENCE_HASH_INVALID)$/, name);
    }
  });

  it("evidence only removes a fee: a clinic-link booking stays free whatever the block says; a signed lt turns a marketplace booking provider-led; junk and foreign tokens change nothing", async () => {
    const link = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Intake link", channelKind: "QR_DESK" });
    const slug = (await w.svc.pages.getForClinic(w.A.admin, w.A.clinicId)).slug;
    const clinicLink = await w.book(A(), slot(), { channel: "CLINIC_LINK", bookingPageSlug: slug, acquisition: block("MARKETPLACE") });
    const cl = await prisma.appointment.findUniqueOrThrow({ where: { id: clinicLink.appointmentId } });
    assert.deepEqual([cl.bookingSource, cl.acquisitionOrigin], ["CLINIC_LINK", "PROVIDER_LED"]);

    const lt = signLinkTouch({ tenantId: w.A.tenantId, code: link.code })!;
    const viaLt = await w.book(A(), slot(), { lt, acquisition: block("MARKETPLACE") });
    const v = await prisma.appointment.findUniqueOrThrow({ where: { id: viaLt.appointmentId } });
    assert.deepEqual([v.bookingSource, v.acquisitionOrigin, (v.attributionJson as { referralLinkCode: string }).referralLinkCode], ["KIOREX_MARKETPLACE", "PROVIDER_LED", link.code]);
    assert.equal(v.acquisitionDecisionRef, "kx_ad_MARKETPLACE", "Kiorex's own decision id is kept when it sent one");

    const noBlock = await w.book(A(), slot(), { lt });
    const nb = await prisma.appointment.findUniqueOrThrow({ where: { id: noBlock.appointmentId } });
    assert.deepEqual([nb.acquisitionDecisionRef, nb.acquisitionPolicyVersion], [`link:${link.code}`, "LINK_TOUCH_V1"]);

    for (const bad of ["garbage", `${lt}x`, signLinkTouch({ tenantId: w.B.tenantId, code: link.code })!, signLinkTouch({ tenantId: w.A.tenantId, code: "ZZZZZZZZ" })!]) {
      const b = await w.book(A(), slot(), { lt: bad });
      assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } })).acquisitionOrigin, "UNATTRIBUTED", `ignored: ${bad.slice(0, 12)}`);
    }
    // the daily booking counter moved once per attributed booking
    const rows = await prisma.providerReferralLinkDaily.findMany({ where: { linkId: link.id } });
    assert.equal(rows.reduce((s, r) => s + r.bookings, 0), 2);
    // check in the two attributed ones: no fee, attended counter increments exactly once even after a revert and a second check-in
    for (const id of [viaLt.appointmentId, noBlock.appointmentId, clinicLink.appointmentId]) await w.checkIn(w.A.tenantId, id, new Date());
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: { in: [viaLt.appointmentId, noBlock.appointmentId, clinicLink.appointmentId] } } }), 0);
    await prisma.$transaction(async (tx) => {
      await w.svc.charges.onRevert(tx, w.A.tenantId, viaLt.appointmentId, "check_in_reverted");
      await tx.appointment.update({ where: { id: viaLt.appointmentId }, data: { status: AppointmentStatus.CONFIRMED, checkedInAt: null } });
    });
    await w.checkIn(w.A.tenantId, viaLt.appointmentId, new Date());
    const after = await prisma.providerReferralLinkDaily.findMany({ where: { linkId: link.id } });
    assert.deepEqual([after.reduce((s, r) => s + r.bookings, 0), after.reduce((s, r) => s + r.attended, 0)], [2, 2]);
  });

  it("decisions are idempotent: repeated and concurrent check-ins leave one decision and one active charge; revert and redo reuse it", async () => {
    const apt = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.KIOREX_MARKETPLACE, isNew: true, origin: "MARKETPLACE" });
    const at = new Date("2026-12-02T10:00:00Z");
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => w.checkIn(w.A.tenantId, apt.id, at)));
    assert.ok(results.some((r) => r.status === "fulfilled"));
    await w.checkIn(w.A.tenantId, apt.id, at);
    assert.equal((await decisionsOf(apt.id)).length, 1);
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: apt.id } }), 1);
    await prisma.$transaction(async (tx) => {
      await w.svc.charges.onRevert(tx, w.A.tenantId, apt.id, "check_in_reverted");
      await tx.appointment.update({ where: { id: apt.id }, data: { status: AppointmentStatus.CONFIRMED, checkedInAt: null } });
    });
    await w.checkIn(w.A.tenantId, apt.id, at);
    assert.equal((await decisionsOf(apt.id)).length, 1, "same policy version, same decision");
    // the writer itself is idempotent and returns the stored row
    const d0 = (await decisionsOf(apt.id))[0]!;
    const again = await prisma.$transaction((tx) => writeCommissionDecision(tx, { tenantId: w.A.tenantId, clinicId: w.A.clinicId, appointmentId: apt.id, policyVersion: d0.policyVersion, origin: "MARKETPLACE", bookingSource: "KIOREX_MARKETPLACE", isNewPatient: true, followUpVisit: false, decision: CommissionDecisionKind.NO_CHARGE, reasonCodes: ["X"] }));
    assert.equal(again.id, d0.id);
    assert.equal(again.decision, "CHARGE", "the first outcome for a policy version stands");
  });

  it("the decision log is append-only at the database level", async () => {
    const apt = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.KIOREX_MARKETPLACE, isNew: true, origin: "MARKETPLACE" });
    await w.checkIn(w.A.tenantId, apt.id, new Date());
    const d = (await decisionsOf(apt.id))[0]!;
    await assert.rejects(prisma.kiorexCommissionDecision.update({ where: { id: d.id }, data: { decision: "NO_CHARGE", amount: null } }), /append-only|immutable|not allowed/i);
    await assert.rejects(prisma.kiorexCommissionDecision.delete({ where: { id: d.id } }), /append-only|immutable|not allowed/i);
  });

  it("returning patients and non-Kiorex sources are explained as NO_CHARGE with their own reason", async () => {
    const ret = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.KIOREX_MARKETPLACE, isNew: false, origin: "MARKETPLACE" });
    const desk = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.FRONT_DESK, isNew: true });
    await w.checkIn(w.A.tenantId, ret.id, new Date());
    await w.checkIn(w.A.tenantId, desk.id, new Date());
    assert.deepEqual((await decisionsOf(ret.id))[0]!.reasonCodes, ["RETURNING_PATIENT"]);
    assert.deepEqual((await decisionsOf(desk.id))[0]!.reasonCodes, ["SOURCE_NOT_COMMISSIONABLE"]);
    assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: { in: [ret.id, desk.id] } } }), 0);
  });

  it("cancelled / no-show handling is configurable per market (default reverses, KEEP leaves the charge)", async () => {
    const mk = async () => {
      const a = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.KIOREX_MARKETPLACE, isNew: true, origin: "MARKETPLACE" });
      await w.checkIn(w.A.tenantId, a.id, new Date());
      return a.id;
    };
    const cancel = (id: string) => prisma.$transaction((tx) => w.svc.charges.onCancelOrNoShow(tx, w.A.tenantId, id));
    const first = await mk();
    await cancel(first);
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: first } })).status, CommissionChargeStatus.REVERSED);
    await prisma.market.update({ where: { id: w.marketId }, data: { featureDefaults: { kiorex: { commissionHandling: { cancelledNoShow: "KEEP" } } } } });
    try {
      const second = await mk();
      await cancel(second);
      assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: second } })).status, CommissionChargeStatus.PENDING);
    } finally {
      await prisma.market.update({ where: { id: w.marketId }, data: { featureDefaults: {} } });
    }
  });

  it("PROVIDER_LED_EVIDENCE dispute: provider link facts auto-approve it, remove the fee, append a decision, emit CommissionAdjusted and flip the origin (never the other way)", async () => {
    const link = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Evidence link" });
    const apt = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.KIOREX_MARKETPLACE, isNew: true, origin: "MARKETPLACE", attributionJson: { referralLinkCode: link.code } });
    await w.checkIn(w.A.tenantId, apt.id, new Date());
    const charge = await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: apt.id } });
    const res = await w.svc.disputes.openDispute(w.A.admin, w.A.tenantId, charge.id, CommissionDisputeReason.PROVIDER_LED_EVIDENCE, "Patient scanned our desk QR");
    assert.equal(res.dispute.status, CommissionDisputeStatus.AUTO_APPROVED);
    assert.match(res.dispute.resolution ?? "", /provider-led evidence confirmed \(MOCK_LOCAL/);
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: charge.id } })).status, CommissionChargeStatus.REVERSED);
    const ds = await decisionsOf(apt.id);
    assert.deepEqual(ds.map((d) => [d.decision, d.origin, d.policyVersion]), [["CHARGE", "MARKETPLACE", "CP1@2020-01-01"], ["NO_CHARGE", "PROVIDER_LED", "CP1@2020-01-01+PLE"]]);
    assert.deepEqual(ds[1]!.reasonCodes, ["PROVIDER_LED_EVIDENCE"]);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: apt.id } })).acquisitionOrigin, "PROVIDER_LED");
    const adj = await prisma.outboxEvent.findFirst({ where: { tenantId: w.A.tenantId, type: COMMISSION_ADJUSTED, aggregateId: apt.id } });
    const p = adj!.payload as Record<string, unknown>;
    assert.deepEqual([p.previousAmount, p.adjustedAmount, p.reason, p.origin, p.decisionRef, p.aggregateType], ["40.00", "0.00", "PROVIDER_LED_EVIDENCE", "PROVIDER_LED", ds[1]!.id, "Appointment"]);
    assert.ok(await prisma.outboxEvent.findFirst({ where: { tenantId: w.A.tenantId, type: COMMISSION_CHARGE_REVERSED, aggregateId: apt.id } }), "the full reversal event still goes out");
    // a later check-in cannot bring the fee back
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id: apt.id }, data: { status: AppointmentStatus.CONFIRMED, checkedInAt: null } });
    });
    await w.checkIn(w.A.tenantId, apt.id, new Date());
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: charge.id } })).status, CommissionChargeStatus.REVERSED);
  });

  it("PROVIDER_LED_EVIDENCE without evidence stays OPEN; the platform resolution path still reaches the same adjusted outcome; evidence auto-approval can be switched off", async () => {
    const mkCharge = async (attributionJson?: object) => {
      const apt = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.KIOREX_MARKETPLACE, isNew: true, origin: "MARKETPLACE", attributionJson });
      await w.checkIn(w.A.tenantId, apt.id, new Date());
      return { apt, charge: await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: apt.id } }) };
    };
    const { apt, charge } = await mkCharge();
    const open = await w.svc.disputes.openDispute(w.A.admin, w.A.tenantId, charge.id, CommissionDisputeReason.PROVIDER_LED_EVIDENCE, "We think so");
    assert.equal(open.dispute.status, CommissionDisputeStatus.OPEN);
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: charge.id } })).status, CommissionChargeStatus.DISPUTED);
    await assert.rejects(w.svc.disputes.resolve(w.A.admin, open.dispute.id, { decision: "APPROVE" }), { status: 403 });
    await w.svc.disputes.resolve(w.platform, open.dispute.id, { decision: "APPROVE", resolution: "Desk QR confirmed by Kiorex ops" });
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { id: charge.id } })).status, CommissionChargeStatus.REVERSED);
    assert.equal((await decisionsOf(apt.id)).at(-1)!.policyVersion, "CP1@2020-01-01+PLE");
    assert.ok(await prisma.outboxEvent.findFirst({ where: { tenantId: w.A.tenantId, type: COMMISSION_ADJUSTED, aggregateId: apt.id } }));

    const link = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Switch-off link" });
    const off = await mkCharge({ referralLinkCode: link.code });
    process.env.GROWTH_EVIDENCE_DISPUTES = "off";
    try {
      const r = await w.svc.disputes.openDispute(w.A.admin, w.A.tenantId, off.charge.id, CommissionDisputeReason.PROVIDER_LED_EVIDENCE, "x");
      assert.equal(r.dispute.status, CommissionDisputeStatus.OPEN, "a human decides while auto-approval is off");
    } finally {
      delete process.env.GROWTH_EVIDENCE_DISPUTES;
    }
    // a link code that does not belong to the organisation is no evidence
    const foreign = await w.svc.links.create(w.B.admin, { clinicId: w.B.clinicId, label: "Foreign link" });
    const f = await mkCharge({ referralLinkCode: foreign.code });
    const fr = await w.svc.disputes.openDispute(w.A.admin, w.A.tenantId, f.charge.id, CommissionDisputeReason.PROVIDER_LED_EVIDENCE, "x");
    assert.equal(fr.dispute.status, CommissionDisputeStatus.OPEN);
  });

  it("override: platform only, reason from a closed list, note required, removal only, audited, emits CommissionAdjusted", async () => {
    const apt = await w.appointmentRow({ tenantId: w.A.tenantId, ...A() }, { source: BookingSource.KIOREX_MARKETPLACE, isNew: true, origin: "MARKETPLACE" });
    await w.checkIn(w.A.tenantId, apt.id, new Date());
    const body = { appointmentId: apt.id, reason: "GOODWILL_WAIVER", note: "Founder approved waiver" };
    await assert.rejects(w.svc.decisions.override(w.A.admin, body), { status: 403 });
    await assert.rejects(w.svc.decisions.override(w.platform, { ...body, reason: "RAISE_FEE" }), { status: 400 });
    await assert.rejects(w.svc.decisions.override(w.platform, { ...body, note: "" }), { status: 400 });
    await assert.rejects(w.svc.decisions.override(w.platform, { ...body, appointmentId: "nope" }), { status: 404 });
    await w.svc.decisions.override(w.platform, body);
    assert.equal((await prisma.kiorexCommissionCharge.findUniqueOrThrow({ where: { appointmentId: apt.id } })).status, CommissionChargeStatus.REVERSED);
    const last = (await decisionsOf(apt.id)).at(-1)!;
    assert.deepEqual([last.decision, last.policyVersion, last.reasonCodes], ["NO_CHARGE", "CP1@2020-01-01+OVR1", ["GOODWILL_WAIVER", "MANUAL_OVERRIDE"]]);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: w.A.tenantId, action: "kiorex.commission_decision.override", resourceId: apt.id, actorId: w.platform.userId } }));
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: w.A.tenantId, action: "kiorex.commission_charge.adjusted", actorId: w.platform.userId } }));
    assert.ok(await prisma.outboxEvent.findFirst({ where: { tenantId: w.A.tenantId, type: COMMISSION_ADJUSTED, aggregateId: apt.id } }));
    await assert.rejects(w.svc.decisions.override(w.platform, body), { status: 400 }, "nothing left to waive, and there is no way to add a fee");
  });

  it("financial reconciliation: the month's statement agrees with charges, explains every NO_CHARGE, and detects tampering; isolated per organisation", async () => {
    const period = new Date().toISOString().slice(0, 7);
    const st = await w.svc.decisions.statement(w.A.admin, { period });
    assert.equal(st.reconciled, true, JSON.stringify(st.mismatches));
    assert.equal(st.mismatches.length, 0);
    assert.ok(Number(st.totals.expectedFromDecisions) > 0);
    // expected = active + the one charge cancelled by the market handling (its latest decision is still CHARGE, the reversal reason explains it);
    // evidence and override reversals appended a NO_CHARGE decision, so they are not expected any more
    assert.equal(Number(st.totals.expectedFromDecisions), Number(st.totals.activeCharges) + 40);
    assert.equal(st.totals.reversedOrWaived, (Number(await prisma.kiorexCommissionCharge.aggregate({ where: { tenantId: w.A.tenantId, status: { in: ["REVERSED", "WAIVED"] } }, _sum: { amount: true } }).then((r) => r._sum.amount ?? 0))).toFixed(2));
    assert.ok(st.noChargeReasons.PROVIDER_LED >= 1 && st.noChargeReasons.RETURNING_PATIENT >= 1);
    assert.ok(st.providerLedBookings >= 3);
    const sum = (await prisma.kiorexCommissionCharge.aggregate({ where: { tenantId: w.A.tenantId, status: { in: ["PENDING", "CONFIRMED", "BILLED", "DISPUTED"] } }, _sum: { amount: true } }))._sum.amount!;
    assert.equal(st.totals.activeCharges, sum.toFixed(2));

    // tampering with a charge amount is caught by the report
    const victim = await prisma.kiorexCommissionCharge.findFirstOrThrow({ where: { tenantId: w.A.tenantId, status: "PENDING" } });
    await prisma.kiorexCommissionCharge.update({ where: { id: victim.id }, data: { amount: 41 } });
    const tampered = await w.svc.decisions.statement(w.A.admin, { period });
    assert.equal(tampered.reconciled, false);
    assert.deepEqual(tampered.mismatches.map((m) => [m.appointmentId, m.kind, m.expected, m.actual]), [[victim.appointmentId, "AMOUNT_MISMATCH", "40.00", "41.00"]]);
    await prisma.kiorexCommissionCharge.update({ where: { id: victim.id }, data: { amount: 40 } });

    // isolation and permissions
    const other = await w.svc.decisions.statement(w.B.admin, { period });
    assert.deepEqual([other.byDecision.CHARGE, other.byDecision.NO_CHARGE, other.totals.activeCharges], [0, 0, "0.00"]);
    const someAppointment = (await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { tenantId: w.A.tenantId } })).appointmentId;
    await assert.rejects(w.svc.decisions.explain(w.B.admin, someAppointment), { status: 404 });
    await assert.rejects(w.svc.decisions.explain(w.A.physician, someAppointment), { status: 403 });
    await assert.rejects(w.svc.decisions.statement(w.A.physician, { period }), { status: 403 });
    await assert.rejects(w.svc.decisions.statement(w.A.admin, { period: "2026-13" }), { status: 400 });
    assert.equal((await w.svc.decisions.explain(w.A.recep, someAppointment)).items.length > 0, true);
  });

  it("booking concurrency: six parallel bookings for one slot create exactly one appointment and one link booking count; the same idempotency key in parallel creates one", async () => {
    const link = await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Concurrency link" });
    const lt = signLinkTouch({ tenantId: w.A.tenantId, code: link.code })!;
    const startsAt = "2027-06-01T09:00:00.000Z";
    const settled = await Promise.allSettled(Array.from({ length: 6 }, () => w.book(A(), startsAt, { lt })));
    const ok = settled.filter((s) => s.status === "fulfilled");
    const lost = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
    assert.equal(ok.length, 1, JSON.stringify(settled.map((s) => s.status)));
    for (const l of lost) assert.equal((l.reason as { status?: number; getResponse?: () => { code?: string } }).getResponse?.().code, "SLOT_TAKEN", "a lost race answers SLOT_TAKEN (409), never a raw database error");
    const slotRows = await prisma.appointment.count({ where: { tenantId: w.A.tenantId, clinicianId: w.A.doc, startsAt: new Date(startsAt) } });
    assert.equal(slotRows, 1);
    const counted = await prisma.providerReferralLinkDaily.findMany({ where: { linkId: link.id } });
    assert.equal(counted.reduce((s, r) => s + r.bookings, 0), 1, "rolled-back attempts leave no counter");

    const key = `SAME-KEY-${w.suffix}`;
    const same = await Promise.allSettled(Array.from({ length: 5 }, () => w.book(A(), "2027-06-02T09:00:00.000Z", { lt }, key)));
    assert.ok(same.some((s) => s.status === "fulfilled"));
    assert.equal(await prisma.appointment.count({ where: { tenantId: w.A.tenantId, externalReference: key } }), 1);
  });
});
