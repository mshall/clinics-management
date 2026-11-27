import { createHmac } from "node:crypto";

/**
 * Query-string signature of the Kiorex partner settlement-statement route (LG-COM-19; spec `kiorex-platform/Docs/PARTNER_STATEMENT_CLIENT_CHANGES.md` section 2; pure, same canonicalisation as Pharmacy and Lab).
 * The contract request HMAC covers method, path and body hash only; this second HMAC (`X-Kiorly-Query-Signature`) covers the query string, with the request's own timestamp and nonce so it cannot be moved to another request.
 * canonical = "kiorly-query-v1\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path + "\n" + canonicalQuery; signature = base64url(HMAC-SHA256(secret, canonical)), the same secret that signs the request.
 */
export const QUERY_SIGNATURE_HEADER = "X-Kiorly-Query-Signature";

/** Sorted `key=value` pairs (by key, then value), key and value percent-encoded with encodeURIComponent, joined with `&`; no query = empty string. */
export function canonicalQuery(query: string | URLSearchParams | undefined): string {
  const raw = typeof query === "string" ? (query.startsWith("?") ? query.slice(1) : query) : query;
  const pairs = [...new URLSearchParams(raw ?? "")];
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

export function signStatementQuery(secret: string, i: { timestamp: string; nonce: string; method: string; path: string; query: string | URLSearchParams | undefined }): string {
  const canonical = `kiorly-query-v1\n${i.timestamp}\n${i.nonce}\n${i.method.toUpperCase()}\n${i.path}\n${canonicalQuery(i.query)}`;
  return createHmac("sha256", secret).update(canonical).digest("base64url");
}

/**
 * The secret that signs the statement request. `KIOREX_STATEMENT_ORG_SECRET` (the per-organisation value Kiorex derives from its master, 16+ characters, secret by reference) wins when set;
 * otherwise the registered client secret is used (the platform accepts both while `COMMISSION_STATEMENT_CLINIC_AUTH` is `either`, and Pharmacy/Lab partners always use their registered secret).
 */
export function statementSigningSecret(registered: string, env: Record<string, string | undefined> = process.env): string {
  const own = env.KIOREX_STATEMENT_ORG_SECRET?.trim();
  return own && own.length >= 16 ? own : registered;
}
