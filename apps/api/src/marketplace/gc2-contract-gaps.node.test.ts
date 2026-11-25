import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { WaitlistOfferStatus } from "@prisma/client";
import { waitlistExpiredReason } from "../messaging/waitlist-autofill.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import { modalitiesOf } from "./marketplace-provider-profile.service";
import { followUpIntervalDays, parseDurationDays, rxItems } from "./record-share.service";
import { KIOREX_WHATSAPP_CHANNEL } from "./marketplace-booking.service";

const events = join(__dirname, "../../../../../kiorex-contracts/events");
const hasContracts = existsSync(events);
const schema = (n: string) => JSON.parse(readFileSync(join(events, `${n}.schema.json`), "utf8")) as { properties: { data: { required: string[]; properties: Record<string, unknown> } } };

describe("GRW-GC-2 (G-10) Rx items and follow-up interval", () => {
  it("maps medication rows to the contract shape, trims, caps and drops empty names", () => {
    const items = rxItems([
      { drugName: " Amoxicillin 500mg ", dosage: "1 capsule", frequency: "3 times daily", duration: "7 days" },
      { drugName: "", dosage: null, frequency: null, duration: null },
      { drugName: "Paracetamol", dosage: null, frequency: null, duration: "free text" },
    ]);
    assert.deepEqual(items, [{ name: "Amoxicillin 500mg", dose: "1 capsule", frequency: "3 times daily", durationDays: 7 }, { name: "Paracetamol" }]);
  });
  it("caps at 50 lines and 200 characters per name", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ drugName: `D${i}`, dosage: null, frequency: null, duration: null }));
    assert.equal(rxItems(many).length, 50);
    assert.equal(rxItems([{ drugName: "x".repeat(300), dosage: "y".repeat(300), frequency: null, duration: null }])[0]!.name.length, 200);
    assert.equal(rxItems([{ drugName: "x", dosage: "y".repeat(300), frequency: null, duration: null }])[0]!.dose!.length, 100);
  });
  it("parses durations in days, weeks, months and Arabic units; rejects text and out of range", () => {
    assert.equal(parseDurationDays("7"), 7);
    assert.equal(parseDurationDays("2 weeks"), 14);
    assert.equal(parseDurationDays("1 month"), 30);
    assert.equal(parseDurationDays("5 أيام"), 5);
    assert.equal(parseDurationDays("5 ايام"), 5);
    assert.equal(parseDurationDays("3 اسابيع"), 21);
    assert.equal(parseDurationDays("0"), undefined);
    assert.equal(parseDurationDays("5000"), undefined);
    assert.equal(parseDurationDays("until better"), undefined);
    assert.equal(parseDurationDays(null), undefined);
  });
  it("follow-up weeks become intervalDays within 1..730", () => {
    assert.equal(followUpIntervalDays(2), 14);
    assert.equal(followUpIntervalDays(104), 728);
    assert.equal(followUpIntervalDays(105), undefined);
    assert.equal(followUpIntervalDays(0), undefined);
    assert.equal(followUpIntervalDays(null), undefined);
  });
  it("the contract schemas still declare what the Clinic emits", { skip: !hasContracts ? "kiorex-contracts sibling absent" : false }, () => {
    assert.ok("items" in schema("PRESCRIPTION_SHARED").properties.data.properties);
    assert.ok("followUp" in schema("VISIT_SUMMARY_SHARED").properties.data.properties);
  });
});

describe("GRW-GC-2 (G-10) telemedicine capability", () => {
  it("modalities use the contract names and always offer at least one", () => {
    assert.deepEqual(modalitiesOf(true, false, false), ["IN_CLINIC"]);
    assert.deepEqual(modalitiesOf(true, false, true), ["IN_CLINIC", "VIDEO"]);
    assert.deepEqual(modalitiesOf(false, false, true), ["VIDEO"]);
    assert.deepEqual(modalitiesOf(true, true, true), ["IN_CLINIC", "VIDEO", "HOME_VISIT"]);
    assert.deepEqual(modalitiesOf(false, false, false), ["IN_CLINIC"]);
  });
});

describe("GRW-GC-2 (G-8) waitlist offer events", () => {
  it("event names match the contract and the payload fields the Clinic sends are in the schema", { skip: !hasContracts ? "kiorex-contracts sibling absent" : false }, () => {
    assert.equal(OUTBOX_EVENT.WAITLIST_OFFER_CREATED, "WAITLIST_OFFER_CREATED");
    assert.equal(OUTBOX_EVENT.WAITLIST_OFFER_EXPIRED, "WAITLIST_OFFER_EXPIRED");
    for (const f of ["offerId", "waitlistRef", "clinicId", "clinicianId", "startsAt", "expiresAt"]) assert.ok(f in schema("WAITLIST_OFFER_CREATED").properties.data.properties, f);
    for (const f of ["offerId", "waitlistRef", "clinicId", "reason", "at"]) assert.ok(f in schema("WAITLIST_OFFER_EXPIRED").properties.data.properties, f);
  });
  it("only an expired or withdrawn offer produces an EXPIRED event; a patient decline or a skip does not", () => {
    assert.equal(waitlistExpiredReason(WaitlistOfferStatus.EXPIRED), "EXPIRED");
    assert.equal(waitlistExpiredReason(WaitlistOfferStatus.WITHDRAWN, "SLOT_TAKEN"), "SLOT_TAKEN");
    assert.equal(waitlistExpiredReason(WaitlistOfferStatus.WITHDRAWN, "PATIENT_LEFT"), "WITHDRAWN");
    assert.equal(waitlistExpiredReason(WaitlistOfferStatus.WITHDRAWN), "WITHDRAWN");
    assert.equal(waitlistExpiredReason(WaitlistOfferStatus.DECLINED), null);
    assert.equal(waitlistExpiredReason(WaitlistOfferStatus.SKIPPED), null);
    assert.equal(waitlistExpiredReason(WaitlistOfferStatus.ACCEPTED), null);
  });
});

describe("GRW-GC-2 (G-9) KIOREX_WHATSAPP channel", () => {
  it("the channel constant is the contract enum value", () => assert.equal(KIOREX_WHATSAPP_CHANNEL, "KIOREX_WHATSAPP"));
});
