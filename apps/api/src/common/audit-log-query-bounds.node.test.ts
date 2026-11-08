import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AUDIT_LOOKBACK_MS, resolveAuditLogCreatedAtFilter } from "./audit-log-query-bounds";

test("resolveAuditLogCreatedAtFilter applies 90d default when open-ended", () => {
  const f = resolveAuditLogCreatedAtFilter();
  assert.ok(f.gte);
  const span = Date.now() - f.gte!.getTime();
  assert.ok(span >= DEFAULT_AUDIT_LOOKBACK_MS - 2000);
  assert.ok(span <= DEFAULT_AUDIT_LOOKBACK_MS + 2000);
});

test("resolveAuditLogCreatedAtFilter honours explicit pair", () => {
  const f = resolveAuditLogCreatedAtFilter("2026-05-01", "2026-05-31");
  assert.equal(f.gte?.toISOString().slice(0, 10), "2026-05-01");
  assert.equal(f.lte?.toISOString().slice(0, 10), "2026-05-31");
});
