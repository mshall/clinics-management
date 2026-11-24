import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createWorld, prisma, prismaSvc, type World } from "../growth-test-kit.test";
import { SlotService } from "../../scheduling/slot.service";
import { emptyAvailabilityWeek } from "../../scheduling/availability-week-schema";
import { decryptClinicianNationalId } from "../../clinician-verification/field-crypto";
import { signLinkTouch } from "../provider-links/link-touch";
import { ShareableSlotsService } from "./shareable-slots.service";
import { SocialTemplatesService } from "./social-templates.service";
import { StatementsService } from "./statements.service";
import { localDay, monthRange } from "./statements.logic";
import { VerificationRequestsService } from "./verification-requests.service";
import { SEED_TEMPLATES } from "./social-templates.catalogue";

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    const r = (e as { getResponse?: () => { code?: string } }).getResponse?.();
    return r?.code ?? String((e as { status?: number }).status ?? e);
  }
};

describe("GRW-P2-C provider marketing portal (real Postgres)", () => {
  let w: World;
  let social: SocialTemplatesService;
  let slots: ShareableSlotsService;
  let verification: VerificationRequestsService;
  let statements: StatementsService;
  let slug: string;

  before(async () => {
    w = await createWorld("pm");
    social = new SocialTemplatesService(prismaSvc, w.svc.audit, w.svc.links);
    // the SAME SlotService instance as the booking path, so its per-day cache is invalidated by the booking like in production
    slots = new ShareableSlotsService(prismaSvc, (w.svc.bookings as unknown as { slots: SlotService }).slots, w.svc.links, social);
    verification = new VerificationRequestsService(prismaSvc, w.svc.audit, w.svc.outbox);
    statements = new StatementsService(prismaSvc, w.svc.audit);
    slug = `pm-${w.suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    await prisma.clinic.update({ where: { id: w.A.clinicId }, data: { bookingSlug: slug } });
    const week = emptyAvailabilityWeek("Africa/Cairo");
    for (const d of week.days) d.slots.push({ start: "09:00", end: "17:00" });
    await prisma.clinicianAvailabilityTemplate.create({ data: { tenantId: w.A.tenantId, clinicId: w.A.clinicId, clinicianId: w.A.doc, weekJson: week } });
  });
  after(async () => {
    await prisma.socialShareLog.deleteMany({ where: { tenantId: { in: [w.A.tenantId, w.B.tenantId] } } });
    await w.cleanup();
  });

  describe("social templates", () => {
    it("seeds 12 approved rows (6 AR + 6 EN), idempotently, and lists them with usage counts", async () => {
      await social.ensureSeed();
      await social.ensureSeed();
      const res = await social.list(w.A.admin, { clinicId: w.A.clinicId });
      const mine = res.items.filter((i) => SEED_TEMPLATES.some((t) => t.slug === i.slug));
      assert.equal(mine.length, 12);
      assert.equal(mine.filter((i) => i.locale === "ar").length, 6);
      assert.equal(res.items.filter((i) => i.locale === "ar").every((i) => /[؀-ۿ]/.test(i.body)), true);
      assert.equal((await social.list(w.A.admin, { locale: "en" })).items.every((i) => i.locale === "en"), true);
    });

    it("renders an EN and an AR card with a tracked link, the protected footer, no patient data, and creates the SOCIAL link once", async () => {
      const tpls = (await social.list(w.A.admin)).items;
      const en = tpls.find((t) => t.slug === "booking-open" && t.locale === "en")!;
      const ar = tpls.find((t) => t.slug === "booking-open" && t.locale === "ar")!;
      const a = await social.render(w.A.admin, { templateId: en.id, clinicId: w.A.clinicId, png: true });
      assert.ok(a.link.includes(`/b/${slug}?s=${a.linkCode}`), a.link);
      assert.ok(a.caption.includes("not medical advice"));
      assert.ok(a.svg.includes("<svg") && a.pngBase64 && Buffer.from(a.pngBase64, "base64").subarray(1, 4).toString() === "PNG");
      const b = await social.render(w.A.admin, { templateId: ar.id, clinicId: w.A.clinicId });
      assert.equal(b.linkCode, a.linkCode, "the same SOCIAL link is reused");
      assert.ok(b.svg.includes('direction="rtl"'));
      const links = await prisma.providerReferralLink.findMany({ where: { tenantId: w.A.tenantId, channelKind: "SOCIAL" } });
      assert.equal(links.length, 1);
      assert.equal(links[0]!.status, "ACTIVE");
      assert.ok(!/patient|phone|mrn/i.test(a.caption + a.svg.replace(/href="data:[^"]*"/g, "").replace(/not medical advice/g, "")), "no patient field in the card (the embedded QR image data is excluded: base64 can contain any letters)");
    });

    it("a doctor template needs a doctor; the doctor's name comes from the server, not the caller", async () => {
      const tpl = (await social.list(w.A.admin)).items.find((t) => t.slug === "doctor-intro" && t.locale === "en")!;
      assert.equal(await codeOf(social.render(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId })), "GROWTH_MARKETING_INVALID");
      const r = await social.render(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId, clinicianId: w.A.doc });
      assert.ok(r.caption.includes("Dr "), r.caption);
      assert.equal(await codeOf(social.render(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId, clinicianId: w.B.doc })), "404");
    });

    it("the content guard refuses guarantees, cures, comparisons and testimonials in the custom line (422) and never stores or renders them", async () => {
      const tpl = (await social.list(w.A.admin)).items.find((t) => t.slug === "booking-open" && t.locale === "en")!;
      for (const line of ["We guarantee results", "A cure for everything", "Cheapest in Cairo", "What our patients say", "ضمان النتيجة", "قبل وبعد"]) {
        assert.equal(await codeOf(social.render(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId, customLine: line })), "CONTENT_NOT_ALLOWED", line);
      }
      const ok = await social.render(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId, customLine: "Open on Saturdays" });
      assert.ok(ok.caption.includes("Open on Saturdays"));
      const urlLine = await social.render(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId, customLine: "see https://evil.example/pay now" });
      assert.ok(!urlLine.caption.includes("evil.example"), "a caller-supplied URL is stripped");
    });

    it("roles: marketing renders, reception cannot, another organisation's template data stays out", async () => {
      const tpl = (await social.list(w.A.admin)).items.find((t) => t.slug === "story-book" && t.locale === "en")!;
      assert.equal((await social.render(w.A.marketing, { templateId: tpl.id, clinicId: w.A.clinicId })).layout, "story");
      assert.equal(await codeOf(social.render(w.A.recep, { templateId: tpl.id, clinicId: w.A.clinicId })), "GROWTH_FORBIDDEN");
      assert.equal(await codeOf(social.render(w.B.admin, { templateId: tpl.id, clinicId: w.A.clinicId })), "404");
      assert.equal((await social.list(w.A.recep)).items.length >= 12, true);
    });

    it("counts shares by template and channel only", async () => {
      const tpl = (await social.list(w.A.admin)).items.find((t) => t.slug === "booking-open" && t.locale === "en")!;
      await social.recordShare(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId, channel: "whatsapp" });
      await social.recordShare(w.A.marketing, { templateId: tpl.id, clinicId: w.A.clinicId, channel: "COPY" });
      assert.equal(await codeOf(social.recordShare(w.A.admin, { templateId: tpl.id, clinicId: w.A.clinicId, channel: "FAX" })), "GROWTH_MARKETING_INVALID");
      const rows = await prisma.socialShareLog.findMany({ where: { tenantId: w.A.tenantId } });
      assert.equal(rows.length, 2);
      assert.deepEqual(Object.keys(rows[0]!).sort(), ["channel", "clinicId", "createdAt", "createdBy", "id", "templateId", "tenantId"]);
      assert.equal((await social.list(w.A.admin, { clinicId: w.A.clinicId })).items.find((i) => i.id === tpl.id)!.shares30d, 2);
    });
  });

  describe("shareable slots", () => {
    it("lists at most 5 future slots without creating a hold, a booking or any row", async () => {
      const before = await Promise.all([prisma.appointment.count({ where: { tenantId: w.A.tenantId } }), prisma.slotHold.count({ where: { tenantId: w.A.tenantId } })]);
      const res = await slots.list(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, days: 3 });
      assert.ok(res.items.length >= 1 && res.items.length <= 5, String(res.items.length));
      assert.ok(res.items.every((s) => Date.parse(s.startsAt) > Date.now()));
      assert.deepEqual(res.items.map((s) => s.startsAt), [...res.items.map((s) => s.startsAt)].sort());
      const after = await Promise.all([prisma.appointment.count({ where: { tenantId: w.A.tenantId } }), prisma.slotHold.count({ where: { tenantId: w.A.tenantId } })]);
      assert.deepEqual(after, before);
      assert.equal(res.timezone, "Africa/Cairo");
    });

    it("a card for two slots is read-only, repeatable (double click) and carries the provider link; the booking made from it is PROVIDER_LED", async () => {
      const list = await slots.list(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, days: 3 });
      const pick = list.items.slice(0, 2).map((s) => s.startsAt);
      const [c1, c2] = await Promise.all([slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: pick, locale: "en" }), slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: pick, locale: "en" })]);
      assert.equal(c1.link, c2.link);
      assert.equal(c1.svg, c2.svg);
      const u = new URL(c1.link);
      assert.equal(u.searchParams.get("slot"), new Date(pick[0]!).toISOString());
      assert.ok(u.searchParams.get("s"));
      const ar = await slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: pick, locale: "ar" });
      assert.ok(ar.svg.includes('direction="rtl"'));
      // the page visit counts and signs a touch, the booking with that touch is provider-led and carries no Kiorex fee
      const touch = await w.svc.core.touch(c1.linkCode, w.A.tenantId, { bot: false });
      assert.ok(touch?.lt);
      const b = await w.book({ clinicId: w.A.clinicId, doc: w.A.doc, typeId: w.A.typeId }, pick[0]!, { lt: touch!.lt });
      const row = await prisma.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
      assert.equal(row.acquisitionOrigin, "PROVIDER_LED");
      await w.checkIn(w.A.tenantId, row.id, new Date());
      assert.equal(await prisma.kiorexCommissionCharge.count({ where: { appointmentId: row.id } }), 0, "no fee through a shared slot link");
      const decision = await prisma.kiorexCommissionDecision.findFirstOrThrow({ where: { appointmentId: row.id } });
      assert.equal(decision.decision, "NO_CHARGE");
    });

    it("a slot that was taken, or is in the past, answers 409 SLOT_NO_LONGER_AVAILABLE with what remains", async () => {
      const list = await slots.list(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, days: 3 });
      assert.ok(list.items.length >= 1);
      const taken = list.items[0]!.startsAt;
      await w.book({ clinicId: w.A.clinicId, doc: w.A.doc, typeId: w.A.typeId }, taken);
      assert.equal(await codeOf(slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: [taken], locale: "en" })), "SLOT_NO_LONGER_AVAILABLE");
      assert.equal(await codeOf(slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: [new Date(Date.now() - 3_600_000).toISOString()], locale: "en" })), "SLOT_NO_LONGER_AVAILABLE");
      assert.equal(await codeOf(slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: [], locale: "en" })), "GROWTH_MARKETING_INVALID");
      assert.equal(await codeOf(slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: Array.from({ length: 6 }, (_, i) => new Date(Date.now() + (i + 1) * 3_600_000).toISOString()), locale: "en" })), "GROWTH_MARKETING_INVALID");
      try {
        await slots.card(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.A.doc, startsAt: [taken], locale: "en" });
      } catch (e) {
        const r = (e as { getResponse: () => { gone: string[]; remaining: { startsAt: string }[] } }).getResponse();
        assert.deepEqual(r.gone, [new Date(taken).toISOString()]);
        assert.ok(!r.remaining.some((s) => s.startsAt === taken));
      }
    });

    it("another organisation's doctor and reception cannot be used; a doctor limited to self", async () => {
      assert.equal(await codeOf(slots.list(w.A.admin, { clinicId: w.A.clinicId, clinicianId: w.B.doc })), "GROWTH_MARKETING_INVALID");
      assert.equal(await codeOf(slots.list(w.A.recep, { clinicId: w.A.clinicId, clinicianId: w.A.doc })), "GROWTH_FORBIDDEN");
      const self = await slots.list({ ...w.A.marketing, userId: w.A.doc }, { clinicId: w.A.clinicId, selfOnly: true, days: 2 });
      assert.equal(self.clinicianId, w.A.doc);
    });
  });

  describe("verification update requests", () => {
    it("creates an encrypted request, emits an event without the value, and blocks a duplicate open request", async () => {
      const r = await verification.create(w.A.admin, { clinicId: w.A.clinicId, field: "LICENSE_NUMBER", newValue: "EG-LIC-998877", oldRef: "EG-G", evidenceFileRefs: ["uploads/lic-1.pdf"] });
      assert.equal(r.status, "SUBMITTED");
      const row = await prisma.providerVerificationUpdateRequest.findUniqueOrThrow({ where: { id: r.id } });
      assert.ok(!row.newValueEnc.includes("998877"), "encrypted at rest");
      assert.equal(decryptClinicianNationalId(row.newValueEnc), "EG-LIC-998877");
      const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: w.A.tenantId, type: "ProviderVerificationUpdateRequested", aggregateId: r.id } });
      const data = ev.payload as Record<string, unknown>;
      assert.deepEqual([data.requestRef, data.orgRef, data.clinicId, data.field, data.evidenceCount], [r.id, w.A.tenantId, w.A.clinicId, "LICENSE_NUMBER", 1]);
      assert.ok(!JSON.stringify(data).includes("998877") && !JSON.stringify(data).includes("lic-1.pdf"), "the value and the file names never travel in the event");
      assert.equal(ev.target, "KIOREX");
      assert.equal(await codeOf(verification.create(w.A.admin, { clinicId: w.A.clinicId, field: "LICENSE_NUMBER", newValue: "other", evidenceFileRefs: [] })), "VERIFICATION_REQUEST_STATE");
      const list = await verification.list(w.A.admin, { clinicId: w.A.clinicId });
      assert.equal(list.badge, "UPDATE_UNDER_REVIEW");
      assert.equal((await verification.create(w.A.admin, { clinicId: w.A.clinicId, field: "ADDRESS", newValue: "5 Nile St", evidenceFileRefs: [] })).field, "ADDRESS");
      assert.equal((await verification.list(w.A.admin)).badge, "UPDATE_UNDER_REVIEW");
    });

    it("validation and roles: photo needs evidence, bad refs refused, only an admin may ask, nobody sees another organisation's request", async () => {
      assert.equal(await codeOf(verification.create(w.A.admin, { clinicId: w.A.clinicId, field: "PHOTO", newValue: "new photo" })), "GROWTH_MARKETING_INVALID");
      assert.equal(await codeOf(verification.create(w.A.admin, { clinicId: w.A.clinicId, field: "SPECIALTY", newValue: "x", evidenceFileRefs: ["../../etc/passwd "] })), "GROWTH_MARKETING_INVALID");
      assert.equal(await codeOf(verification.create(w.A.admin, { clinicId: w.A.clinicId, field: "NOPE", newValue: "x" })), "GROWTH_MARKETING_INVALID");
      assert.equal(await codeOf(verification.create(w.A.marketing, { clinicId: w.A.clinicId, field: "SPECIALTY", newValue: "x" })), "GROWTH_FORBIDDEN");
      assert.equal(await codeOf(verification.create(w.A.admin, { clinicId: w.B.clinicId, field: "SPECIALTY", newValue: "x" })), "404");
      assert.equal((await verification.list(w.B.admin)).items.length, 0);
      assert.equal((await verification.list(w.A.recep)).items.length >= 2, true, "reception can see the status");
    });

    it("round trip with a fake Kiorex: read the value, ask for more info, add evidence, approve; decisions are idempotent and org-bound", async () => {
      const [first] = (await verification.list(w.A.admin, { clinicId: w.A.clinicId })).items.filter((i) => i.field === "ADDRESS");
      const read = await verification.readForKiorex(first!.id);
      assert.equal(read.newValue, "5 Nile St");
      assert.equal(read.orgRef, w.A.tenantId);
      const needs = await verification.applyDecision({ requestRef: first!.id, kiorexRef: "kx_vr_1", orgRef: w.A.tenantId, clinicId: w.A.clinicId, decision: "NEEDS_INFO", note: "Please add a utility bill", decidedAt: new Date().toISOString() });
      assert.equal(needs.status, "NEEDS_INFO");
      assert.equal(await codeOf(verification.addEvidence(w.A.marketing, first!.id, { evidenceFileRefs: ["f2"] })), "GROWTH_FORBIDDEN");
      const more = await verification.addEvidence(w.A.admin, first!.id, { evidenceFileRefs: ["uploads/bill.pdf"] });
      assert.equal(more.status, "SUBMITTED");
      assert.equal(more.evidenceCount, 1);
      assert.equal((await prisma.outboxEvent.count({ where: { tenantId: w.A.tenantId, type: "ProviderVerificationUpdateRequested", aggregateId: first!.id } })), 2, "re-sent with the same requestRef");
      assert.equal(await codeOf(verification.applyDecision({ requestRef: first!.id, orgRef: w.B.tenantId, decision: "APPROVED" })), "VERIFICATION_REQUEST_NOT_FOUND");
      assert.equal(await codeOf(verification.applyDecision({ requestRef: first!.id, decision: "MAYBE" })), "VERIFICATION_DECISION_INVALID");
      const ok = await verification.applyDecision({ requestRef: first!.id, kiorexRef: "kx_vr_1", orgRef: w.A.tenantId, decision: "APPROVED", note: "Verified", decidedAt: new Date().toISOString() });
      assert.deepEqual([ok.status, ok.duplicate], ["APPROVED", false]);
      const dup = await verification.applyDecision({ requestRef: first!.id, decision: "REJECTED" });
      assert.deepEqual([dup.status, dup.duplicate], ["APPROVED", true], "a closed request is not reopened by a late decision");
      const shown = (await verification.list(w.A.admin, { clinicId: w.A.clinicId })).items.find((i) => i.id === first!.id)!;
      assert.deepEqual([shown.status, shown.decisionNote, shown.kiorexRef], ["APPROVED", "Verified", "kx_vr_1"]);
    });

    it("withdraw: open only; the badge returns when the licence request is withdrawn", async () => {
      const lic = (await verification.list(w.A.admin, { clinicId: w.A.clinicId })).items.find((i) => i.field === "LICENSE_NUMBER")!;
      assert.equal((await verification.withdraw(w.A.admin, lic.id)).status, "WITHDRAWN");
      assert.equal(await codeOf(verification.withdraw(w.A.admin, lic.id)), "VERIFICATION_REQUEST_STATE");
      assert.equal((await verification.list(w.A.admin)).badge, "VERIFIED");
      assert.equal(await codeOf(verification.withdraw(w.B.admin, lic.id)), "404");
    });
  });

  describe("commission statements v2", () => {
    it("lines equal the decision log and the charge ledger; totals are exact; CSV and PDF are recorded with a checksum", async () => {
      const A = { clinicId: w.A.clinicId, doc: w.A.doc, typeId: w.A.typeId };
      const month = localDay(new Date(), "Africa/Cairo").slice(0, 7);
      const base = Date.UTC(2027, 5, 1, 6);
      const a = await w.book(A, new Date(base).toISOString());
      const b = await w.book(A, new Date(base + 2 * 3_600_000).toISOString());
      const led = await w.book(A, new Date(base + 4 * 3_600_000).toISOString(), { lt: signLinkTouch({ tenantId: w.A.tenantId, code: (await w.svc.links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Desk", ownerScope: "CLINIC" })).code })! });
      const at = new Date();
      for (const x of [a, b, led]) await w.checkIn(w.A.tenantId, x.appointmentId, at);
      const s = await statements.statement(w.A.admin, month, w.A.clinicId);
      assert.equal(s.zone, "Africa/Cairo");
      const mine = s.lines.filter((l) => [a.appointmentId, b.appointmentId, led.appointmentId].includes(l.appointmentId));
      assert.equal(mine.length, 3);
      const charged = mine.filter((l) => l.decision === "CHARGE");
      assert.equal(charged.length, 2);
      assert.ok(charged.every((l) => l.amount === "40.00" && l.chargeStatus === "PENDING"));
      assert.equal(mine.find((l) => l.appointmentId === led.appointmentId)!.decision, "NO_CHARGE");
      // equals the append-only tables, row for row
      const range = monthRange(month, "Africa/Cairo")!;
      const ledger = await prisma.kiorexCommissionCharge.findMany({ where: { tenantId: w.A.tenantId, attendedAt: { gte: range.start, lt: range.end } } });
      assert.equal(Math.round(ledger.reduce((n, c) => n + Number(c.amount), 0) * 100), s.totals.activeMinor);
      assert.equal(s.totals.activeCount, ledger.length);
      assert.ok(s.totals.providerLed >= 1);
      assert.ok(!JSON.stringify(s).match(/firstName|lastName|phone|Patient\d/i), "no patient data in a statement");

      const csv = await statements.csv(w.A.admin, month, w.A.clinicId);
      assert.ok(csv.body.includes(`TOTAL,${month}`));
      assert.ok(csv.body.includes(s.totals.active));
      const pdf = await statements.pdf(w.A.admin, month, w.A.clinicId);
      assert.equal(pdf.body.subarray(0, 5).toString("ascii"), "%PDF-");
      const hist = await statements.exports(w.A.admin, month);
      assert.deepEqual(hist.items.map((i) => i.kind).sort(), ["CSV", "PDF"]);
      assert.match(hist.items[0]!.checksum, /^[0-9a-f]{64}$/);
    });

    it("month boundaries are the market's local month: a check-in at 00:30 Cairo on 1 July is July, 23:30 on 30 June is June", async () => {
      const A = { clinicId: w.A.clinicId, doc: w.A.doc, typeId: w.A.typeId };
      const n1 = await w.book(A, new Date(Date.UTC(2027, 7, 1, 6)).toISOString());
      const n2 = await w.book(A, new Date(Date.UTC(2027, 7, 1, 8)).toISOString());
      await w.checkIn(w.A.tenantId, n1.appointmentId, new Date("2027-06-30T20:30:00Z")); // 23:30 Cairo (UTC+3) on 30 June
      await w.checkIn(w.A.tenantId, n2.appointmentId, new Date("2027-06-30T21:30:00Z")); // 00:30 Cairo on 1 July
      const june = await statements.statement(w.A.admin, "2027-06", w.A.clinicId);
      const july = await statements.statement(w.A.admin, "2027-07", w.A.clinicId);
      assert.ok(june.lines.some((l) => l.appointmentId === n1.appointmentId) || (await prisma.kiorexCommissionDecision.count({ where: { appointmentId: n1.appointmentId } })) > 0);
      const chargeIn = (id: string, st: typeof june) => st.lines.find((l) => l.appointmentId === id)?.chargeStatus ?? null;
      assert.ok(chargeIn(n1.appointmentId, june) !== null, "23:30 on 30 June is June");
      assert.equal(chargeIn(n2.appointmentId, june), null, "00:30 on 1 July is not June");
      assert.ok(chargeIn(n2.appointmentId, july) !== null, "it is July");
    });

    it("only an admin sees fees: marketing, reception, doctors and other organisations get nothing; a bad month is a 400", async () => {
      for (const u of [w.A.marketing, w.A.recep, w.A.physician]) {
        assert.equal(await codeOf(statements.statement(u, "2027-06")), "GROWTH_FORBIDDEN");
        assert.equal(await codeOf(statements.csv(u, "2027-06")), "GROWTH_FORBIDDEN");
      }
      assert.equal(await codeOf(statements.statement(w.A.admin, "2027-13")), "STATEMENT_MONTH_INVALID");
      assert.equal((await statements.statement(w.B.admin, "2027-06")).lines.length, 0);
      assert.ok((await statements.months(w.A.admin)).items.length >= 1);
    });
  });
});
