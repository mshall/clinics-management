import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { AppointmentStatus, HomeVisitState, PrismaClient } from "@prisma/client";
import { encryptVisitAddress } from "./address-crypto";
import { buildKit, buildWorld, cleanup, seedVisit, snapshotFor, type World } from "./hv-test-kit";

const prisma = new PrismaClient();
const suffix = `${Date.now()}`.slice(-9);

type Kit = Awaited<ReturnType<typeof buildKit>>;

describe("HV* home visits (integration)", () => {
  let w: World;
  let kit: Kit;

  before(async () => {
    await prisma.$connect();
    w = await buildWorld(prisma, suffix);
    kit = await buildKit(prisma);
    await prisma.clinicianHomeSettings.create({ data: { tenantId: w.tenantId, clinicianId: w.clinician.row.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city", "heliopolis"], dailyVisitCap: 3 } });
  });
  after(async () => {
    await cleanup(prisma, w.tenantId);
    await prisma.$disconnect();
  });

  it("HVCFG: gated capability is OFF until gate evidence arrives; booked visits and safety stay available (flag OFF is never a safety switch)", async () => {
    const off = await buildKit(prisma, snapshotFor({ gates: { "clinic.home_visits": false } }));
    await assert.rejects(
      off.config.upsertSettings(w.tenantId, w.admin.jwt, w.other.row.id, { acceptsHomeVisits: true, coverageDistrictIds: ["maadi"] }),
      (e: { getStatus: () => number; getResponse: () => { code: string; key: string } }) => e.getStatus() === 403 && e.getResponse().code === "FEATURE_DISABLED" && e.getResponse().key === "clinic.home_visits",
    );
    await assert.rejects(off.homeVisits.assertBookable({ tenantId: w.tenantId, clinicId: w.clinicId, clinicianId: w.clinician.row.id, type: w.homeType, startsAt: new Date(Date.now() + 86400_000), endsAt: new Date(Date.now() + 86400_000 + 1800_000), address: { district: "nasr-city", line1: "x" }, source: "KIOREX" }), /unavailable/);

    // an already-booked visit still runs with the flag OFF, including SOS and unsafe-abort
    const { visit } = await seedVisit(prisma, w, { start: new Date(Date.now() - 10 * 60_000) });
    await off.exec.depart(w.tenantId, w.clinician.jwt, visit.id, { lat: 30.05, lng: 31.33 });
    const sos = await off.exec.sos(w.tenantId, w.clinician.jwt, visit.id, { lat: 30.0561, lng: 31.3301 });
    assert.equal(sos.delivered, true);
    assert.deepEqual(sos.show, { ambulance: "123", police: "122" });
    await off.exec.abortUnsafe(w.tenantId, w.clinician.jwt, visit.id, { reason: "unsafe dog", reasonCategory: "UNSAFE_ENVIRONMENT" });
    assert.equal((await prisma.homeVisit.findUniqueOrThrow({ where: { id: visit.id } })).state, HomeVisitState.ABORTED_UNSAFE);
  });

  it("HVCFG01-03/HVBK06: configure a HOME type (30/30 default buffers), settings validation, gender restriction is the clinician's own", async () => {
    const t = await kit.config.configureType(w.tenantId, w.admin.jwt, w.homeType.id, { serviceLocation: "HOME", homeSurchargeAmount: 60 });
    assert.equal(t.travelBufferBeforeMin, 30);
    assert.equal(t.travelBufferAfterMin, 30);
    assert.equal(t.homeSurchargeAmount, "60");
    await assert.rejects(kit.config.upsertSettings(w.tenantId, w.clinician.jwt, w.clinician.row.id, { maxTravelMinutes: 30 }), /startDistrictId/);
    await assert.rejects(kit.config.upsertSettings(w.tenantId, w.admin.jwt, w.clinician.row.id, { restrictToPatientGender: "F" }), /own patient-gender restriction/);
    const s = await kit.config.upsertSettings(w.tenantId, w.clinician.jwt, w.clinician.row.id, { restrictToPatientGender: "F", homeHours: { mon: [["09:00", "18:00"]] } });
    assert.equal(s.restrictToPatientGender, "F");
    await kit.config.upsertSettings(w.tenantId, w.clinician.jwt, w.clinician.row.id, { restrictToPatientGender: null, homeHours: null });
  });

  it("dentists have no home visits at launch: SCOPE_NOT_ALLOWED when enabling (scope of practice, not a flag)", async () => {
    const dentist = await prisma.user.create({ data: { tenantId: w.tenantId, email: `dent.${suffix}@example.com`, passwordHash: "x", displayName: "Dentist", role: "PHYSICIAN", profession: "DENTIST" } });
    await assert.rejects(
      kit.config.upsertSettings(w.tenantId, w.admin.jwt, dentist.id, { acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city"] }),
      (e: { getResponse: () => { code: string; capability: string } }) => e.getResponse().code === "SCOPE_NOT_ALLOWED" && e.getResponse().capability === "home_visits.perform",
    );
  });

  it("HVBK01: 422 OUT_OF_COVERAGE for an uncovered district; HOME slots carry serviceLocation + district; daily cap and travel buffers apply", async () => {
    await assert.rejects(kit.homeVisits.assertCovered(w.tenantId, w.clinician.row.id, "6th-october"), (e: { getStatus: () => number; getResponse: () => { code: string; district: string } }) => e.getStatus() === 422 && e.getResponse().code === "OUT_OF_COVERAGE" && e.getResponse().district === "6th-october");
    const day = new Date("2031-03-03T00:00:00Z"); // a future Monday, far from other tests
    const slots = [9, 10, 11, 12, 13, 14].map((h) => ({ startsAt: new Date(day.getTime() + (h - 2) * 3600_000).toISOString(), endsAt: new Date(day.getTime() + (h - 2) * 3600_000 + 1800_000).toISOString() }));
    const out = await kit.homeVisits.filterHomeSlots({ tenantId: w.tenantId, clinicId: w.clinicId, clinicianId: w.clinician.row.id, district: "Nasr City", slots });
    assert.equal(out.length, 6);
    assert.ok(out.every((s) => s.serviceLocation === "HOME" && s.district === "nasr-city"));
    // three booked visits that day => the daily cap (3) removes every slot
    for (const h of [9, 11, 13]) await seedVisit(prisma, w, { start: new Date(day.getTime() + (h - 2) * 3600_000), minutes: 30 });
    const capped = await kit.homeVisits.filterHomeSlots({ tenantId: w.tenantId, clinicId: w.clinicId, clinicianId: w.clinician.row.id, district: "nasr-city", slots });
    assert.equal(capped.length, 0);
  });

  it("HVBK02/HVSAF03/HVFEE01: front-desk booking carries an encrypted address; a first home visit needs a verified phone or a deposit; surcharge is a separate field", async () => {
    const start = new Date("2031-04-07T08:00:00Z");
    const input = { clinicId: w.clinicId, patientId: w.patient.id, clinicianId: w.clinician.row.id, appointmentTypeId: w.homeType.id, startsAt: start.toISOString(), visitAddress: { district: "nasr-city", line1: "12 Example St", flat: "4" }, addressConfirmed: true };
    // no deposit configured + front desk (no Kiorex verification) => refused
    await assert.rejects(kit.booking.bookFromFrontDesk(w.tenantId, w.admin.jwt, input), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "FIRST_HOME_VISIT_REQUIRES_VERIFIED_PHONE_OR_DEPOSIT");
    await prisma.appointmentType.update({ where: { id: w.homeType.id }, data: { depositAmount: 100 } });
    const booked = await kit.booking.bookFromFrontDesk(w.tenantId, w.admin.jwt, input);
    assert.equal(booked.state, HomeVisitState.CONFIRMED);
    assert.equal(booked.fee?.baseFee, 300);
    assert.equal(booked.fee?.surcharge, 60);
    assert.equal(booked.fee?.total, 360);
    const row = await prisma.homeVisit.findUniqueOrThrow({ where: { id: booked.id } });
    assert.ok(row.addressCiphertext && !row.addressCiphertext.includes("Example"), "ciphertext only");
    const appt = await prisma.appointment.findUniqueOrThrow({ where: { id: row.appointmentId } });
    assert.equal(appt.serviceLocation, "HOME");
    assert.equal(Number(appt.feeAmount), 300, "feeAmount (the commission/revenue-share base) excludes the surcharge, BR56");
    assert.equal(Number(appt.homeSurchargeAmount), 60);
    await prisma.appointmentType.update({ where: { id: w.homeType.id }, data: { depositAmount: null } });
  });

  it("HVPRV01 address privacy: only the assigned clinician and admins see it; other clinicians get 403; masked 24 h after the visit and wiped by the job", async () => {
    const { visit } = await seedVisit(prisma, w, { start: new Date(Date.now() + 3600_000), address: { district: "heliopolis", line1: "99 Secret Lane" } });
    const mine = await kit.homeVisits.get(w.tenantId, w.clinician.jwt, visit.id);
    assert.equal((mine.address as { line1?: string }).line1, "99 Secret Lane");
    assert.ok((mine.patient as { phone?: string }).phone);
    const admin = await kit.homeVisits.get(w.tenantId, w.admin.jwt, visit.id);
    assert.equal((admin.address as { line1?: string }).line1, "99 Secret Lane");
    await assert.rejects(kit.homeVisits.get(w.tenantId, w.other.jwt, visit.id), /not assigned to you/);
    // REQUESTED visits do not reveal the address yet
    await prisma.homeVisit.update({ where: { id: visit.id }, data: { state: "REQUESTED" } });
    const requested = await kit.homeVisits.get(w.tenantId, w.clinician.jwt, visit.id);
    assert.deepEqual(requested.address, { district: "heliopolis", masked: true });
    assert.equal((requested.patient as { phone?: string }).phone, undefined, "no phone while masked");
    // finished 25 h ago => masked for everyone, even admins, and the ciphertext is wiped by the job
    await prisma.homeVisit.update({ where: { id: visit.id }, data: { state: "FINISHED", endedAt: new Date(Date.now() - 25 * 3600_000), finishedAt: new Date(Date.now() - 25 * 3600_000) } });
    const after = await kit.homeVisits.get(w.tenantId, w.admin.jwt, visit.id);
    assert.deepEqual(after.address, { district: "heliopolis", masked: true });
    assert.ok((await kit.privacy.maskExpiredAddresses()) >= 1);
    const wiped = await prisma.homeVisit.findUniqueOrThrow({ where: { id: visit.id } });
    assert.equal(wiped.addressCiphertext, null);
    assert.ok(wiped.addressMaskedAt);
    assert.equal(await kit.privacy.maskExpiredAddresses(), 0 + (await prisma.homeVisit.count({ where: { endedAt: { lte: new Date(Date.now() - 24 * 3600_000) }, addressMaskedAt: null, addressCiphertext: { not: null } } })), "idempotent");
  });

  it("HVEXE01-03: depart -> arrive (= check-in) -> finish with coarse geostamps; the field events belong to the assigned clinician only", async () => {
    const { visit, appt } = await seedVisit(prisma, w, { start: new Date(Date.now() + 1800_000), kiorex: true });
    await assert.rejects(kit.exec.depart(w.tenantId, w.other.jwt, visit.id, {}), /not assigned to you/);
    await assert.rejects(kit.exec.depart(w.tenantId, w.admin.jwt, visit.id, {}), /not assigned to you/, "even admins cannot fake the on-site facts");
    await assert.rejects(kit.exec.arrive(w.tenantId, w.clinician.jwt, visit.id, {}), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "ILLEGAL_TRANSITION");
    const dep = await kit.exec.depart(w.tenantId, w.clinician.jwt, visit.id, { lat: 30.056123, lng: 31.330987, etaMinutes: 20 });
    assert.equal(dep.state, "ON_MY_WAY");
    assert.equal((dep.address as { masked: boolean }).masked, false, "address revealed at On my way");
    await assert.rejects(kit.exec.arrive(w.tenantId, w.clinician.jwt, visit.id, {}), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "GEOSTAMP_REQUIRED");
    const arr = await kit.exec.arrive(w.tenantId, w.clinician.jwt, visit.id, { lat: 30.0561, lng: 31.3301 });
    assert.equal(arr.state, "ARRIVED");
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status, AppointmentStatus.CHECKED_IN, "Arrived = check-in");
    const fin = await kit.exec.finish(w.tenantId, w.clinician.jwt, visit.id, { lat: 30.0561, lng: 31.3301 });
    assert.equal(fin.state, "FINISHED");
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status, AppointmentStatus.COMPLETED, "Finished = complete");
    const stamps = await prisma.homeVisitGeostamp.findMany({ where: { visitId: visit.id }, orderBy: { recordedAt: "asc" } });
    assert.deepEqual(stamps.map((s) => s.kind), ["ON_MY_WAY", "ARRIVED", "FINISHED"]);
    assert.equal(stamps[0]!.lat, 30.06, "coarse (~1 km), never the exact point");
    // Kiorex bookings emit HOME_VISIT_EN_ROUTE, with no address or coordinates
    const ev = await prisma.outboxEvent.findFirst({ where: { tenantId: w.tenantId, type: "HOME_VISIT_EN_ROUTE", aggregateId: appt.id } });
    assert.ok(ev);
    const text = JSON.stringify(ev!.payload);
    assert.ok(!/Example|30\.05|31\.33|lat|lng|line1/.test(text), text);
  });

  it("HVSAF04 (BR61): unsafe abort is never a no-show; the deposit is held for review, the incident is logged and the safety contact is alerted", async () => {
    const { visit, appt } = await seedVisit(prisma, w, { start: new Date(Date.now() + 1800_000), kiorex: true });
    await kit.exec.depart(w.tenantId, w.clinician.jwt, visit.id, { lat: 30.05, lng: 31.33 });
    await assert.rejects(kit.exec.abortUnsafe(w.tenantId, w.clinician.jwt, visit.id, { reason: "  " }), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "REASON_REQUIRED");
    const out = await kit.exec.abortUnsafe(w.tenantId, w.clinician.jwt, visit.id, { reason: "He shouted and blocked the door at 12 Example St", reasonCategory: "THREAT_OR_VIOLENCE", lat: 30.05, lng: 31.33 });
    assert.equal(out.state, "ABORTED_UNSAFE");
    assert.equal((out as { noShow?: boolean }).noShow, false);
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    assert.equal(a.status, AppointmentStatus.CANCELLED);
    assert.notEqual(a.status, AppointmentStatus.NO_SHOW);
    assert.equal(a.depositRefundable, null, "undecided: held for ops review, never auto-forfeited");
    const events = await prisma.outboxEvent.findMany({ where: { tenantId: w.tenantId, aggregateId: appt.id } });
    const types = events.map((e) => e.type);
    assert.ok(types.includes("HOME_VISIT_ABORTED_UNSAFE"));
    assert.ok(!types.includes("NO_SHOW") && !types.includes("CANCELLED_BY_CLINIC"), "no automatic cancel/no-show event reaches Kiorex");
    const ab = events.find((e) => e.type === "HOME_VISIT_ABORTED_UNSAFE")!.payload as Record<string, unknown>;
    assert.equal(ab.noShow, false);
    assert.equal(ab.depositAction, "HOLD_FOR_REVIEW");
    assert.equal(ab.reasonCategory, "THREAT_OR_VIOLENCE");
    assert.ok(!JSON.stringify(ab).includes("Example"), "free text never leaves Kiorly");
    assert.ok(await prisma.clinicalIncident.findFirst({ where: { tenantId: w.tenantId, severity: "HIGH", summaryEn: { contains: visit.id } } }), "incident logged for the owner");
    const alert = await prisma.homeSafetyAlert.findFirst({ where: { visitId: visit.id, kind: "UNSAFE_ABORT" } });
    assert.equal(alert?.status, "DELIVERED");
    // a no-show can never be recorded for an aborted visit
    const r = kit.port.applyVisitEvent({ id: visit.id, state: "ABORTED_UNSAFE", plannedStartMs: 0, plannedEndMs: 1, history: [] }, { type: "MARK_NO_SHOW" }, Date.now());
    assert.equal(r.ok, false);
  });

  it("HVSAF01 safety drill: prompt at planned end + 30 min, alert 10 min later without an answer, delivered <= 60 s, PHI-free, then escalated if nobody acknowledges", async () => {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string) => {
      if (String(s).includes("safety_alert.")) lines.push(String(s).trim());
      return orig(s);
    };
    try {
      const plannedEnd = new Date("2031-05-05T10:00:00Z");
      // The safety clock is global: drain visits left over from other seeds/tests (e.g. the Rev 2.3 demo data) two days
      // before this drill so only the visit seeded below is in play afterwards.
      const drainAt = new Date(plannedEnd.getTime() - 2 * 24 * 3_600_000);
      await kit.safety.tick(drainAt);
      await kit.safety.tick(new Date(drainAt.getTime() + 11 * 60_000));
      await kit.safety.escalateUnacknowledged(new Date(drainAt.getTime() + 30 * 60_000));
      const { visit } = await seedVisit(prisma, w, { start: new Date(plannedEnd.getTime() - 30 * 60_000), minutes: 30 });
      await prisma.homeVisit.update({ where: { id: visit.id }, data: { state: "ARRIVED", arrivedAt: new Date(plannedEnd.getTime() - 25 * 60_000) } });
      let r = await kit.safety.tick(new Date(plannedEnd.getTime() + 29 * 60_000));
      assert.deepEqual(r, { prompts: 0, alerts: 0 });
      r = await kit.safety.tick(new Date(plannedEnd.getTime() + 30 * 60_000 + 1000));
      assert.deepEqual(r, { prompts: 1, alerts: 0 });
      assert.ok(await prisma.staffInAppNotice.findFirst({ where: { userId: w.clinician.row.id, kind: "HOME_SAFETY_PROMPT" } }));
      r = await kit.safety.tick(new Date(plannedEnd.getTime() + 39 * 60_000));
      assert.equal(r.alerts, 0, "still inside the 10 minute answer window");
      r = await kit.safety.tick(new Date(plannedEnd.getTime() + 40 * 60_000 + 2000));
      assert.equal(r.alerts, 1);
      assert.equal((await kit.safety.tick(new Date(plannedEnd.getTime() + 41 * 60_000))).alerts, 0, "exactly one alert");
      const alert = await prisma.homeSafetyAlert.findFirstOrThrow({ where: { visitId: visit.id } });
      assert.equal(alert.kind, "NO_ANSWER");
      assert.equal(alert.status, "DELIVERED");
      assert.ok(alert.latencyMs != null && alert.latencyMs <= 60_000 && alert.withinSla);
      const inbox = await prisma.devInboxMessage.findFirst({ where: { relatedId: visit.id, templateKey: "home_visit.safety_alert" } });
      assert.ok(inbox, "mock SMS delivered to the organisation safety contact");
      assert.equal(inbox!.toAddress, "+201000000999");
      assert.ok(!/Example|Patient|Secret/.test(inbox!.bodyText), "alert body carries no patient data or address");
      // not acknowledged within 10 min => escalated (on-call page + owner notice)
      assert.equal(await kit.safety.escalateUnacknowledged(new Date(alert.raisedAt.getTime() + 11 * 60_000)), 1);
      assert.equal((await prisma.homeSafetyAlert.findUniqueOrThrow({ where: { id: alert.id } })).status, "ESCALATED");
      assert.ok(await prisma.staffInAppNotice.findFirst({ where: { tenantId: w.tenantId, kind: "HOME_SAFETY_ESCALATION" } }));
      assert.ok(lines.some((l) => JSON.parse(l).event === "safety_alert.raised" && JSON.parse(l).alertId === alert.id));
      assert.ok(lines.some((l) => JSON.parse(l).event === "safety_alert.delivered" && JSON.parse(l).alertId === alert.id));
      for (const l of lines) assert.ok(!/Example|Patient|\+2010|nasr|30\./i.test(l), `log line is PHI-free: ${l}`);
    } finally {
      (process.stdout as unknown as { write: typeof orig }).write = orig;
    }
  });

  it("HVSAF01: answering the prompt restarts the timer; no safety contact => the alert FAILS loudly (on-call paged), never silently", async () => {
    const plannedEnd = new Date("2031-06-02T10:00:00Z");
    const { visit } = await seedVisit(prisma, w, { start: new Date(plannedEnd.getTime() - 30 * 60_000) });
    await prisma.homeVisit.update({ where: { id: visit.id }, data: { state: "ARRIVED" } });
    await kit.safety.tick(new Date(plannedEnd.getTime() + 31 * 60_000));
    await kit.exec.answerSafetyPrompt(w.tenantId, w.clinician.jwt, visit.id, new Date(plannedEnd.getTime() + 35 * 60_000));
    assert.equal((await kit.safety.tick(new Date(plannedEnd.getTime() + 50 * 60_000))).alerts, 0, "answered: no alert");

    const bare = await buildWorld(prisma, `${suffix}b`, { safetyContact: false });
    try {
      const kit2 = await buildKit(prisma);
      const v2 = await seedVisit(prisma, bare, { start: new Date(Date.now() - 20 * 60_000) });
      await prisma.homeVisit.update({ where: { id: v2.visit.id }, data: { state: "ON_MY_WAY" } });
      const res = await kit2.safety.sos(bare.tenantId, v2.visit.id, { lat: 30, lng: 31 });
      assert.equal(res.delivered, false);
      assert.equal(res.alert.status, "FAILED");
    } finally {
      await cleanup(prisma, bare.tenantId);
    }
  });

  it("HVSAF02: SOS shows 123 / 122 and shares live location with the safety contact only while on my way / on site", async () => {
    const { visit } = await seedVisit(prisma, w, { start: new Date(Date.now() + 3600_000) });
    await assert.rejects(kit.exec.sos(w.tenantId, w.clinician.jwt, visit.id, { lat: 30, lng: 31 }), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "SOS_NOT_AVAILABLE");
    await kit.exec.depart(w.tenantId, w.clinician.jwt, visit.id, {});
    const sos = await kit.exec.sos(w.tenantId, w.clinician.jwt, visit.id, { lat: 30.044421, lng: 31.235712 });
    assert.deepEqual(sos.show, { ambulance: "123", police: "122" });
    const inbox = await prisma.devInboxMessage.findFirst({ where: { relatedId: visit.id, templateKey: "home_visit.sos" } });
    assert.match(inbox!.bodyText, /30\.044421,31\.235712/, "the safety contact gets the live location");
    const stored = await prisma.homeVisitGeostamp.findFirstOrThrow({ where: { visitId: visit.id, kind: "SOS" } });
    assert.equal(stored.lat, 30.04, "stored coarse");
  });

  it("geostamp retention: 12 months then district only; batched and idempotent; recent stamps untouched", async () => {
    const { visit } = await seedVisit(prisma, w, { start: new Date(Date.now() + 7200_000) });
    const old = new Date(Date.now() - 400 * 86_400_000);
    const recent = new Date(Date.now() - 30 * 86_400_000);
    const a = await prisma.homeVisitGeostamp.create({ data: { tenantId: w.tenantId, visitId: visit.id, kind: "ARRIVED", lat: 30.05, lng: 31.33, districtId: "nasr-city", recordedAt: old } });
    const b = await prisma.homeVisitGeostamp.create({ data: { tenantId: w.tenantId, visitId: visit.id, kind: "FINISHED", lat: 30.06, lng: 31.34, districtId: "nasr-city", recordedAt: recent } });
    const r1 = await kit.privacy.purgeGeostamps(new Date(), 1000);
    assert.ok(r1.purged >= 1);
    const ra = await prisma.homeVisitGeostamp.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(ra.lat, null);
    assert.equal(ra.lng, null);
    assert.equal(ra.districtId, "nasr-city", "district kept");
    assert.ok(ra.purgedAt);
    assert.equal((await prisma.homeVisitGeostamp.findUniqueOrThrow({ where: { id: b.id } })).lat, 30.06);
    const r2 = await kit.privacy.purgeGeostamps(new Date(), 1000);
    assert.equal(r2.purged, 0, "idempotent");
    assert.equal(r2.remaining, 0);
  });

  it("KNAG04 dispatch guard: an unverified nurse (or an aide) can never be assigned; a verified clinician can, and Kiorex gets HOME_VISIT_ASSIGNED with no phone or address", async () => {
    const unverified = await prisma.user.create({ data: { tenantId: w.tenantId, email: `unv.${suffix}@example.com`, passwordHash: "x", displayName: "Unverified Nurse", role: "PHYSICIAN", profession: "NURSE" } });
    await prisma.clinicianHomeSettings.create({ data: { tenantId: w.tenantId, clinicianId: unverified.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city"] } });
    const aide = await prisma.user.create({ data: { tenantId: w.tenantId, email: `aide.${suffix}@example.com`, passwordHash: "x", displayName: "Aide", role: "PHYSICIAN", profession: "ASSISTANT", supervisorUserId: w.clinician.row.id } });
    const { visit, appt } = await seedVisit(prisma, w, { start: new Date("2031-07-07T09:00:00Z"), kiorex: true, clinicianId: w.other.row.id });
    await prisma.clinicianHomeSettings.create({ data: { tenantId: w.tenantId, clinicianId: w.other.row.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city"] } });
    await assert.rejects(kit.homeVisits.assign(w.tenantId, w.admin.jwt, visit.id, unverified.id), (e: { getResponse: () => { code: string } }) => e.getResponse().code === "CLINICIAN_NOT_VERIFIED");
    await assert.rejects(kit.homeVisits.assign(w.tenantId, w.admin.jwt, visit.id, aide.id), /cannot be assigned|SCOPE|not verified/i);
    await assert.rejects(kit.homeVisits.assign(w.tenantId, w.clinician.jwt, visit.id, w.clinician.row.id), /dispatcher or manager/);
    const done = await kit.homeVisits.assign(w.tenantId, w.admin.jwt, visit.id, w.clinician.row.id);
    assert.equal(done.clinicianId, w.clinician.row.id);
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).clinicianId, w.clinician.row.id);
    const ev = await prisma.outboxEvent.findFirstOrThrow({ where: { tenantId: w.tenantId, type: "HOME_VISIT_ASSIGNED", aggregateId: appt.id } });
    const payload = ev.payload as { assignee: Record<string, unknown> };
    assert.ok(payload.assignee.displayName);
    assert.equal(payload.assignee.badge, "Verified physician");
    assert.ok(!("phone" in payload.assignee) && !/@example|\+20|Example/.test(JSON.stringify(ev.payload)));
  });

  it("clinic.home_dispatch ranks verified, in-zone, free clinicians with continuity first; OFF = 403 (manual assign still works)", async () => {
    const { visit } = await seedVisit(prisma, w, { start: new Date("2031-08-04T09:00:00Z"), clinicianId: w.other.row.id });
    const s = await kit.homeVisits.suggest(w.tenantId, w.admin.jwt, visit.id);
    assert.ok(s.suggestions.length >= 1);
    assert.ok(s.suggestions.every((x) => x.reasons.includes("IN_ZONE")));
    const off = await buildKit(prisma, snapshotFor({ off: ["clinic.home_dispatch"] }));
    await assert.rejects(off.homeVisits.suggest(w.tenantId, w.admin.jwt, visit.id), (e: { getResponse: () => { code: string; key: string } }) => e.getResponse().key === "clinic.home_dispatch");
  });

  it("HVEXE01 route: list view only when clinic.home_route_view is OFF; with it ON, legs + navigation links only for entitled viewers", async () => {
    const day = new Date("2031-09-01T07:00:00Z");
    const w2 = await buildWorld(prisma, `${suffix}r`);
    try {
      await prisma.clinicianHomeSettings.create({ data: { tenantId: w2.tenantId, clinicianId: w2.clinician.row.id, acceptsHomeVisits: true, coverageDistrictIds: ["nasr-city", "heliopolis"] } });
      await seedVisit(prisma, w2, { start: day, district: "nasr-city", address: { district: "nasr-city", line1: "1 First St" } });
      await seedVisit(prisma, w2, { start: new Date(day.getTime() + 3 * 3600_000), address: { district: "heliopolis", line1: "2 Second St" } });
      const on = await buildKit(prisma);
      const route = await on.homeVisits.route(w2.tenantId, w2.clinician.jwt, { date: "2031-09-01" });
      assert.equal(route.view, "ROUTE");
      assert.equal(route.items.length, 2);
      assert.ok(route.items[0]!.plannedStartsAt < route.items[1]!.plannedStartsAt);
      assert.match((route.items[0] as { navigationUrl: string }).navigationUrl, /^https:\/\/maps\.mock\.kiorly\.test\//);
      assert.ok(typeof (route.items[1] as { travelMinutesFromPrevious: number }).travelMinutesFromPrevious === "number");
      const off = await buildKit(prisma, snapshotFor({ off: ["clinic.home_route_view"] }));
      const list = await off.homeVisits.route(w2.tenantId, w2.clinician.jwt, { date: "2031-09-01" });
      assert.equal(list.view, "LIST");
      assert.ok(!("navigationUrl" in list.items[0]!));
      // a masked visit never gets a link
      await prisma.homeVisit.updateMany({ where: { tenantId: w2.tenantId }, data: { state: "REQUESTED" } });
      const masked = await on.homeVisits.route(w2.tenantId, w2.clinician.jwt, { date: "2031-09-01" });
      assert.equal((masked.items[0] as { navigationUrl: string | null }).navigationUrl, null);
    } finally {
      await cleanup(prisma, w2.tenantId);
    }
  });

  it("HVRPT01: reports split in-clinic vs home (visits, revenue incl. separate surcharge, cancellations) at district level only", async () => {
    const { HomeVisitReportsService } = await import("./home-visit-reports.service");
    const rep = new HomeVisitReportsService(kit.p, kit.maps);
    const out = await rep.split(w.tenantId, { from: new Date("2000-01-01"), to: new Date("2100-01-01") });
    assert.ok(out.HOME.visits >= 1);
    assert.ok(Number(out.HOME.homeSurchargeRevenue) >= 50);
    assert.ok(out.HOME.cancellations >= 1, "the unsafe-abort visit closed its appointment");
    assert.ok(typeof out.HOME.travelMinutes === "number");
    assert.ok(!JSON.stringify(out).includes("Example"));
  });

  it("a ciphertext copied to another tenant's row does not decrypt there (tenant bound as AAD)", async () => {
    const ct = encryptVisitAddress({ district: "maadi", line1: "A" }, w.tenantId);
    const { decryptVisitAddress } = await import("./address-crypto");
    assert.equal(decryptVisitAddress(ct, "other-tenant"), null);
  });
});
