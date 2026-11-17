import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMessagingOptOutKeyword,
  resolveMessagingPurpose,
  MESSAGING_CONSENT_MARKETING,
  MESSAGING_CONSENT_TRANSACTIONAL,
  defaultConsentGranted,
} from "./messaging-consent.constants";

describe("MS-03 messaging consent", () => {
  it("classifies recall templates as marketing", () => {
    assert.equal(resolveMessagingPurpose("recall_birthday"), MESSAGING_CONSENT_MARKETING);
    assert.equal(resolveMessagingPurpose("appointment_reminder_whatsapp"), MESSAGING_CONSENT_TRANSACTIONAL);
  });

  it("recognizes STOP and Arabic opt-out keywords", () => {
    assert.equal(isMessagingOptOutKeyword("STOP"), true);
    assert.equal(isMessagingOptOutKeyword("stop"), true);
    assert.equal(isMessagingOptOutKeyword("إلغاء"), true);
    assert.equal(isMessagingOptOutKeyword("hello"), false);
  });

  it("defaults transactional granted and marketing denied", () => {
    assert.equal(defaultConsentGranted(MESSAGING_CONSENT_TRANSACTIONAL), true);
    assert.equal(defaultConsentGranted(MESSAGING_CONSENT_MARKETING), false);
  });
});