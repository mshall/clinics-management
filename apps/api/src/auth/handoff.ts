import { createHash, randomBytes } from "node:crypto";

/**
 * Kiorly Home sign-in HANDOFF (ADR-038, founder decision 24 Nov 2026).
 *
 * Home's password form posts the credentials to `POST /auth/handoff/login` (this API, CORS allow-listed for the Home origin only). The API
 * checks them exactly like the normal login and answers with a SINGLE-USE opaque code, never a session token. Home navigates the browser to
 * `<product web>/login?handoff=<code>`; the product web calls `POST /auth/handoff/exchange` and receives the normal session. So Home's own
 * code never sees a product token, and the password only travels in that one request.
 *
 * Code: 256 random bits (base64url, 43 chars), stored ONLY as a SHA-256 hash, valid 30 seconds, bound to this product (and edition) and to
 * the Home origin it was issued for. Consumption is one atomic update, so a replay (or a race of two redeems) fails with 401. The code is
 * never logged and never put in an error message. Pure module: the store is injected, so it is unit-tested without a database.
 */
export const HANDOFF_TTL_MS = 30_000;
export const HANDOFF_PRODUCT = "clinic" as const;
export type HandoffProduct = "clinic" | "pharmacy" | "lab";

export interface HandoffEntry { codeHash: string; product: HandoffProduct; edition: string | null; origin: string; subjectId: string; expiresAt: Date }
export interface HandoffStore {
  insert(entry: HandoffEntry): Promise<void>;
  /** Atomically mark the code used and return its entry; null when unknown, already used or expired. */
  consume(codeHash: string, now: Date): Promise<HandoffEntry | null>;
  /** Housekeeping: delete rows that expired before `before`. */
  purge(before: Date): Promise<void>;
}

/** One uniform failure for every reason (unknown, replayed, expired, wrong product or origin): no oracle for an attacker. */
export class HandoffError extends Error {
  readonly code = "HANDOFF_INVALID";
  constructor() { super("The sign-in link is invalid or expired. Sign in again."); }
}

export const hashHandoffCode = (code: string): string => createHash("sha256").update(code, "utf8").digest("hex");
export const newHandoffCode = (): string => randomBytes(32).toString("base64url");
const CODE_SHAPE = /^[A-Za-z0-9_-]{43}$/;

const LOCAL_HOME = "http://localhost:5194,http://127.0.0.1:5194";
/** Origins of Kiorly Home allowed to start a handoff. Production/staging MUST set KIORLY_HOME_ORIGINS (from config/domains.json: home + aliases); the local default is dev/test only. */
export function homeOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.KIORLY_HOME_ORIGINS?.trim() || (env.NODE_ENV === "production" ? "" : LOCAL_HOME);
  return raw.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}
export const isHomeOrigin = (origin: string | undefined | null, env: Record<string, string | undefined> = process.env): boolean => !!origin && homeOrigins(env).includes(origin.replace(/\/+$/, ""));

/** Where the browser goes after a successful `handoff/login` (this product's own web). Local default only outside production. */
export function webBaseUrl(env: Record<string, string | undefined> = process.env, localDefault = "http://localhost:5174"): string | null {
  const v = (env.APP_WEB_URL?.trim() || (env.NODE_ENV === "production" ? "" : localDefault)).replace(/\/+$/, "");
  return v || null;
}

export class HandoffCodes {
  constructor(
    private readonly store: HandoffStore,
    private readonly product: HandoffProduct,
    private readonly opts: { now?: () => Date; ttlMs?: number } = {},
  ) {}
  private now() { return this.opts.now ? this.opts.now() : new Date(); }

  /** `origin` must already have been checked against `isHomeOrigin` by the caller (the controller does). */
  async issue(input: { subjectId: string; origin: string; edition?: string | null }): Promise<{ code: string; expiresInSeconds: number }> {
    const ttl = this.opts.ttlMs ?? HANDOFF_TTL_MS;
    const code = newHandoffCode();
    const now = this.now();
    await this.store.insert({ codeHash: hashHandoffCode(code), product: this.product, edition: input.edition ?? null, origin: input.origin.replace(/\/+$/, ""), subjectId: input.subjectId, expiresAt: new Date(now.getTime() + ttl) });
    void this.store.purge(new Date(now.getTime() - 10 * 60_000)).catch(() => undefined);
    return { code, expiresInSeconds: Math.round(ttl / 1000) };
  }

  /** One-time redemption. Optional `edition` / `expectOrigin` must equal what the code was bound to. Every failure is the same HandoffError. */
  async redeem(input: { code: unknown; edition?: string | null; expectOrigin?: string }): Promise<{ subjectId: string; origin: string; edition: string | null }> {
    if (typeof input.code !== "string" || !CODE_SHAPE.test(input.code)) throw new HandoffError();
    const entry = await this.store.consume(hashHandoffCode(input.code), this.now());
    if (!entry || entry.expiresAt.getTime() <= this.now().getTime()) throw new HandoffError();
    if (entry.product !== this.product) throw new HandoffError();
    if ((input.edition ?? null) !== entry.edition) throw new HandoffError();
    if (input.expectOrigin !== undefined && input.expectOrigin.replace(/\/+$/, "") !== entry.origin) throw new HandoffError();
    return { subjectId: entry.subjectId, origin: entry.origin, edition: entry.edition };
  }
}

/** In-memory store for unit tests (same atomic semantics as the SQL one). */
export class MemoryHandoffStore implements HandoffStore {
  readonly rows = new Map<string, HandoffEntry & { usedAt: Date | null }>();
  async insert(e: HandoffEntry) { this.rows.set(e.codeHash, { ...e, usedAt: null }); }
  async consume(codeHash: string, now: Date) {
    const r = this.rows.get(codeHash);
    if (!r || r.usedAt || r.expiresAt.getTime() <= now.getTime()) return null;
    r.usedAt = now;
    return r;
  }
  async purge(before: Date) { for (const [k, r] of this.rows) if (r.expiresAt < before) this.rows.delete(k); }
}
