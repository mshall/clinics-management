import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATIONAL_ALERTS,
  OPERATIONAL_ALERT_IDS,
  OPERATIONAL_DASHBOARDS,
  OPERATIONAL_DASHBOARD_IDS,
} from "./operational-alerts";
import { assertRunbookHasRequiredSections, readOperationalRunbook } from "./operational-runbooks";
import { shouldAlertSignupFunnelDrop } from "./signup-funnel-health";
import { whatsappFailureSpike } from "./whatsapp-delivery-health";

describe("QA-05 operational alerts", () => {
  it("catalog matches alert id union", () => {
    const ids = new Set(OPERATIONAL_ALERTS.map((a) => a.id));
    assert.equal(ids.size, OPERATIONAL_ALERT_IDS.length);
    for (const id of OPERATIONAL_ALERT_IDS) assert.ok(ids.has(id));
  });

  it("every dashboard panel references known alerts", () => {
    const alertSet = new Set(OPERATIONAL_ALERT_IDS);
    assert.equal(OPERATIONAL_DASHBOARDS.length, OPERATIONAL_DASHBOARD_IDS.length);
    for (const panel of OPERATIONAL_DASHBOARDS) {
      for (const aid of panel.alertIds) assert.ok(alertSet.has(aid));
    }
  });

  for (const alert of OPERATIONAL_ALERTS) {
    it(`runbook entry for ${alert.id}`, () => {
      const content = readOperationalRunbook(alert.runbookDoc);
      assertRunbookHasRequiredSections(content, alert.runbookDoc);
      assert.ok(content.includes(alert.id) || content.includes(alert.auditAction));
    });
  }

  it("signup funnel drop threshold", () => {
    assert.equal(shouldAlertSignupFunnelDrop({ otpVerified: 20, signupsCompleted: 5 }), true);
    assert.equal(shouldAlertSignupFunnelDrop({ otpVerified: 20, signupsCompleted: 12 }), false);
    assert.equal(shouldAlertSignupFunnelDrop({ otpVerified: 5, signupsCompleted: 0 }), false);
  });

  it("whatsapp failure spike threshold", () => {
    assert.equal(whatsappFailureSpike(11), false);
    assert.equal(whatsappFailureSpike(12), true);
  });
});