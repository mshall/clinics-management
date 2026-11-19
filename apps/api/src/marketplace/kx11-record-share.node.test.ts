import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordShareScope } from "@prisma/client";
import { isActiveShareGrant, isRecordShareScope, RECORD_SHARE_SCOPES } from "./record-share.scopes";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";

describe("KX-11 record-share scopes", () => {
  it("defines VISIT_SUMMARY, PRESCRIPTIONS, LAB_RESULTS, SHARE_WITH_OTHER_CLINICS", () => {
    assert.deepEqual([...RECORD_SHARE_SCOPES], [
      RecordShareScope.VISIT_SUMMARY,
      RecordShareScope.PRESCRIPTIONS,
      RecordShareScope.LAB_RESULTS,
      RecordShareScope.SHARE_WITH_OTHER_CLINICS,
    ]);
    assert.equal(isRecordShareScope("VISIT_SUMMARY"), true);
    assert.equal(isRecordShareScope("NOPE"), false);
  });

  it("treats revoked or denied rows as inactive (nothing shared without active consent)", () => {
    assert.equal(isActiveShareGrant(null), false);
    assert.equal(isActiveShareGrant({ granted: false, revokedAt: null }), false);
    assert.equal(isActiveShareGrant({ granted: true, revokedAt: new Date() }), false);
    assert.equal(isActiveShareGrant({ granted: true, revokedAt: null }), true);
  });

  it("emits VISIT_SUMMARY_SHARED outbox event type", () => {
    assert.equal(OUTBOX_EVENT.VISIT_SUMMARY_SHARED, "VISIT_SUMMARY_SHARED");
    assert.equal(OUTBOX_EVENT.RECORD_SHARE_REVOKED, "RECORD_SHARE_REVOKED");
  });
});
