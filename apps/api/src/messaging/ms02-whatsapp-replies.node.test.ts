import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_REMINDER_QUICK_REPLIES,
  replyActionFromPayload,
  WHATSAPP_REPLY_CANCEL,
  WHATSAPP_REPLY_CONFIRM,
} from "./whatsapp-reply-payloads";

describe("MS-02 quick reply payloads", () => {
  it("maps Meta button payloads to actions", () => {
    assert.equal(replyActionFromPayload(WHATSAPP_REPLY_CONFIRM), "confirm");
    assert.equal(replyActionFromPayload(WHATSAPP_REPLY_CANCEL), "cancel");
    assert.equal(replyActionFromPayload("UNKNOWN_PAYLOAD"), null);
  });

  it("default reminder quick replies include confirm/cancel/reschedule", () => {
    assert.deepEqual([...DEFAULT_REMINDER_QUICK_REPLIES], [
      "KIORLY_CONFIRM",
      "KIORLY_CANCEL",
      "KIORLY_RESCHEDULE",
    ]);
  });
});