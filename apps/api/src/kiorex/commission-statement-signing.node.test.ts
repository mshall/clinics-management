import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signEvidenceRequest } from "./attribution-evidence.service";
import { canonicalQuery, signStatementQuery, statementSigningSecret } from "./commission-statement-signing";

// Vector produced by the platform verifier (kiorex-platform apps/api/src/commissions/commission-partner-signing.ts, signStatementQuery) for these inputs.
const V = { secret: "0123456789abcdef-secret", timestamp: "1790000000000", nonce: "nonce-abc-123", method: "GET", path: "/api/v1/partner/commissions/settlement-statement", query: "to=2026-12-31T22%3A00%3A00.000Z&from=2026-11-30T22%3A00%3A00.000Z&q=a b&q=a+%26" };

test("canonical query is sorted and percent-encoded exactly as the platform does", () => {
  assert.equal(canonicalQuery(V.query), "from=2026-11-30T22%3A00%3A00.000Z&q=a%20%26&q=a%20b&to=2026-12-31T22%3A00%3A00.000Z");
  assert.equal(canonicalQuery("to=2026-12-31&from=2026-12-01"), "from=2026-12-01&to=2026-12-31");
  assert.equal(canonicalQuery("?a=b%20c&a=a"), "a=a&a=b%20c");
  assert.equal(canonicalQuery(undefined), ""); assert.equal(canonicalQuery(""), "");
  assert.equal(canonicalQuery(new URLSearchParams({ to: "2", from: "1" })), "from=1&to=2");
});

test("signature equals the platform reference vector", () => {
  assert.equal(signStatementQuery(V.secret, V), "cmt8oi30rR24acYsDsaeKNQ84Lpj5y27zISLc5-wJM8");
});

test("signature binds secret, timestamp, nonce, method, path and query", () => {
  const base = signStatementQuery(V.secret, V);
  for (const alt of [{ timestamp: "1790000000001" }, { nonce: "other" }, { method: "POST" }, { path: V.path + "/export" }, { query: "from=2026-11-30" }])
    assert.notEqual(signStatementQuery(V.secret, { ...V, ...alt }), base);
  assert.notEqual(signStatementQuery("another-secret-0123456", V), base);
  assert.equal(signStatementQuery(V.secret, { ...V, method: "get" }), base);
});

test("a request signed like the service signs it carries a query signature over its own timestamp and nonce", () => {
  const url = new URL("https://kiorex.example/api/v1/partner/commissions/settlement-statement");
  url.searchParams.set("from", "2026-11-01T00:00:00.000Z"); url.searchParams.set("to", "2026-12-01T00:00:00.000Z");
  const h = signEvidenceRequest({ secret: V.secret, clientKey: "k", method: "GET", path: url.pathname, orgRef: "org-1" });
  const sig = signStatementQuery(V.secret, { timestamp: h["x-kiorly-timestamp"], nonce: h["x-kiorly-nonce"], method: "GET", path: url.pathname, query: url.searchParams });
  const expected = createHmac("sha256", V.secret).update(`kiorly-query-v1\n${h["x-kiorly-timestamp"]}\n${h["x-kiorly-nonce"]}\nGET\n${url.pathname}\n${canonicalQuery(url.search)}`).digest("base64url");
  assert.equal(sig, expected);
});

test("per-organisation secret from config wins, shared registered secret is the fallback", () => {
  assert.equal(statementSigningSecret("registered-secret", {}), "registered-secret");
  assert.equal(statementSigningSecret("registered-secret", { KIOREX_STATEMENT_ORG_SECRET: "short" }), "registered-secret");
  assert.equal(statementSigningSecret("registered-secret", { KIOREX_STATEMENT_ORG_SECRET: "  per-org-secret-0123456  " }), "per-org-secret-0123456");
});
