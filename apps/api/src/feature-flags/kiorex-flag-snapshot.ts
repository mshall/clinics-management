/**
 * FF03 — Kiorex control-plane snapshot contract helpers (see kiorex-contracts/openapi/kiorex-control-plane.v1.openapi.json).
 * Pure functions only; the poller lives in `kiorex-flag-snapshot.service.ts`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  marketplaceCanonicalString,
  sha256BodyHex,
  signMarketplaceRequest,
} from "../marketplace/marketplace-hmac";
import type { FlagClass, FlagScopeName } from "./feature-flag-keys";

export const SNAPSHOT_PRODUCT = "kiorly-clinic";
export const SNAPSHOT_PATH = "/api/v1/control/v1/flags/snapshot";

export type SnapshotFlagValues = {
  global?: "OFF";
  markets?: Record<string, "OFF">;
  orgs?: Record<string, "OFF">;
};

export type SnapshotFlag = {
  key: string;
  class: FlagClass;
  scopes: FlagScopeName[];
  dependsOn: string[];
  launchLocked: boolean;
  gateSatisfied: boolean;
  values: SnapshotFlagValues;
  expiresAt?: string;
};

export type FlagSnapshot = {
  product: string;
  version: number;
  generatedAt: string;
  flags: SnapshotFlag[];
  signature: string;
};

/** Deterministic JSON with recursively sorted object keys (no whitespace). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(",")}]`;
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** base64url HMAC-SHA256 over the canonical JSON of the snapshot without its `signature` field. */
export function signSnapshot(secret: string, snapshot: Omit<FlagSnapshot, "signature"> | FlagSnapshot): string {
  const { signature: _ignored, ...rest } = snapshot as FlagSnapshot;
  return createHmac("sha256", secret).update(canonicalJson(rest)).digest("base64url");
}

export function verifySnapshot(secret: string, snapshot: FlagSnapshot): boolean {
  if (typeof snapshot.signature !== "string" || !snapshot.signature) return false;
  const a = Buffer.from(signSnapshot(secret, snapshot));
  const b = Buffer.from(snapshot.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signControlPlaneRequest(input: {
  secret: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body?: Buffer;
}): string {
  return signMarketplaceRequest(
    input.secret,
    marketplaceCanonicalString({
      timestamp: input.timestamp,
      nonce: input.nonce,
      method: input.method,
      path: input.path,
      bodySha256: sha256BodyHex(input.body),
    }),
  );
}

/** `sha256=<hex HMAC(secret, `${timestamp}.${rawBody}`)>` — flag.changed webhook scheme. */
export function signFlagWebhook(secret: string, timestampSeconds: string, rawBody: string | Buffer): string {
  const h = createHmac("sha256", secret);
  h.update(`${timestampSeconds}.`);
  h.update(rawBody);
  return `sha256=${h.digest("hex")}`;
}

export function verifyFlagWebhook(
  secret: string,
  timestampSeconds: string,
  rawBody: string | Buffer,
  signature: string,
): boolean {
  const expected = Buffer.from(signFlagWebhook(secret, timestampSeconds, rawBody));
  const given = Buffer.from(signature ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type SnapshotChange = {
  key: string;
  scope: FlagScopeName | "gate";
  scopeId: string | null;
  from: string;
  to: string;
};

/** Diff of explicit OFF values and gate evidence between two snapshots (previous may be null). */
export function diffSnapshots(prev: FlagSnapshot | null, next: FlagSnapshot): SnapshotChange[] {
  const out: SnapshotChange[] = [];
  const prevByKey = new Map((prev?.flags ?? []).map((f) => [f.key, f]));
  const nextByKey = new Map(next.flags.map((f) => [f.key, f]));
  const keys = new Set([...prevByKey.keys(), ...nextByKey.keys()]);
  for (const key of [...keys].sort()) {
    const a = prevByKey.get(key);
    const b = nextByKey.get(key);
    const val = (v: "OFF" | undefined) => v ?? "INHERIT";
    if (val(a?.values.global) !== val(b?.values.global)) {
      out.push({ key, scope: "global", scopeId: null, from: val(a?.values.global), to: val(b?.values.global) });
    }
    for (const [scope, pick] of [
      ["market", (f?: SnapshotFlag) => f?.values.markets ?? {}],
      ["org", (f?: SnapshotFlag) => f?.values.orgs ?? {}],
    ] as const) {
      const pa = pick(a);
      const pb = pick(b);
      for (const id of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
        if (val(pa[id]) !== val(pb[id])) out.push({ key, scope, scopeId: id, from: val(pa[id]), to: val(pb[id]) });
      }
    }
    if ((a?.gateSatisfied ?? false) !== (b?.gateSatisfied ?? false)) {
      out.push({
        key,
        scope: "gate",
        scopeId: null,
        from: String(a?.gateSatisfied ?? false),
        to: String(b?.gateSatisfied ?? false),
      });
    }
    if ((a?.expiresAt ?? null) !== (b?.expiresAt ?? null) && a && b) {
      out.push({ key, scope: "global", scopeId: null, from: `expires:${a.expiresAt ?? "-"}`, to: `expires:${b.expiresAt ?? "-"}` });
    }
  }
  return out;
}

/** Structural validation of an untrusted snapshot body. Returns an error string or null. */
export function validateSnapshotShape(body: unknown): string | null {
  if (!body || typeof body !== "object") return "not an object";
  const s = body as Partial<FlagSnapshot>;
  if (s.product !== SNAPSHOT_PRODUCT) return `unexpected product ${String(s.product)}`;
  if (!Number.isInteger(s.version) || (s.version as number) < 0) return "bad version";
  if (typeof s.generatedAt !== "string" || Number.isNaN(Date.parse(s.generatedAt))) return "bad generatedAt";
  if (!Array.isArray(s.flags)) return "flags must be an array";
  for (const f of s.flags) {
    if (!f || typeof f.key !== "string" || typeof f.values !== "object" || f.values === null) return "bad flag entry";
  }
  return null;
}
