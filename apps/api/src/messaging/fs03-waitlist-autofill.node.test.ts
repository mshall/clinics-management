import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waitlistOpenSlotKey } from "../scheduling/scheduling.service";
import { DEFAULT_WAITLIST_OFFER_HOLD_MINUTES, eligibleForSlot, waitlistOfferHoldMinutes } from "./waitlist-autofill.service";
import { replyActionFromPayload, WHATSAPP_REPLY_WAITLIST_ACCEPT, WHATSAPP_REPLY_WAITLIST_DECLINE } from "./whatsapp-reply-payloads";

describe("FS-03 waitlist auto-fill helpers", () => {
  it("offer hold comes from the market pack, clamped, default 15 minutes", () => {
    assert.equal(waitlistOfferHoldMinutes(null), DEFAULT_WAITLIST_OFFER_HOLD_MINUTES);
    assert.equal(waitlistOfferHoldMinutes({ messaging: { waitlist: { offerHoldMinutes: 30 } } }), 30);
    assert.equal(waitlistOfferHoldMinutes({ messaging: { waitlist: { offerHoldMinutes: 2 } } }), 15);
    assert.equal(waitlistOfferHoldMinutes({ messaging: { waitlist: { offerHoldMinutes: "20" } } }), 15);
  });

  it("only entries whose preferred window covers the slot are eligible, order kept", () => {
    const at = new Date("2026-12-01T10:00:00Z");
    const entries = [
      { id: "a", patientId: "pa", preferredFrom: null, preferredTo: null },
      { id: "b", patientId: "pb", preferredFrom: new Date("2026-12-02T00:00:00Z"), preferredTo: null },
      { id: "c", patientId: "pc", preferredFrom: new Date("2026-11-30T00:00:00Z"), preferredTo: new Date("2026-12-01T12:00:00Z") },
      { id: "d", patientId: "pd", preferredFrom: null, preferredTo: new Date("2026-12-01T09:00:00Z") },
    ];
    assert.deepEqual(
      eligibleForSlot(entries, at).map((e) => e.id),
      ["a", "c"],
    );
  });

  it("open-slot key is per clinician and start time", () => {
    const at = new Date("2026-12-01T10:00:00Z");
    assert.equal(waitlistOpenSlotKey("doc1", at), waitlistOpenSlotKey("doc1", new Date(at)));
    assert.notEqual(waitlistOpenSlotKey("doc1", at), waitlistOpenSlotKey("doc2", at));
  });

  it("Accept / Decline buttons map to waitlist reply actions", () => {
    assert.equal(replyActionFromPayload(WHATSAPP_REPLY_WAITLIST_ACCEPT), "waitlist_accept");
    assert.equal(replyActionFromPayload(WHATSAPP_REPLY_WAITLIST_DECLINE), "waitlist_decline");
  });
});
