/* eslint-disable @typescript-eslint/no-explicit-any -- dotted-path walkers over the i18n bundles */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { creditsAr, creditsEn } from "./credits-strings";
import { categoryTone, daysUntil, expiringSoon, lotsInSpendOrder, recentMonths, type WalletLot } from "./credits-logic";

const flat = (o: Record<string, unknown>, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
const get = (o: any, path: string): string => path.split(".").reduce((x: any, p) => x[p], o);
const NOW = Date.parse("2026-12-20T10:00:00Z");
const lot = (id: string, remaining: string, expiresAt: string | null): WalletLot => ({ id, reason: "GOODWILL", category: "SERVICE_RECOVERY", remaining, expiresAt });

describe("Credit wording (AR and EN)", () => {
  it("identical keys, no empty values, same placeholders", () => {
    assert.deepEqual(flat(creditsEn).sort(), flat(creditsAr).sort());
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const k of flat(creditsEn)) { const e = get(creditsEn, k); const a = get(creditsAr, k); assert.ok(e.length > 0 && a.length > 0, k); assert.equal(ph(e), ph(a), k); }
  });
  it("Arabic has no Latin words", () => {
    for (const k of flat(creditsAr)) assert.deepEqual(get(creditsAr, k).replace(/\{\{\w+\}\}/g, "").match(/[A-Za-z][A-Za-z0-9]*/g) ?? [], [], k);
  });
  it("every ledger reason a provider can see has a label (the server enum)", () => {
    for (const r of ["KIOREX_LATE_REVERSAL", "REFERRAL", "PROMO", "NO_SHOW_GUARANTEE", "GOODWILL", "DOWNGRADE_PRORATION", "ADJUSTMENT", "KIOREX_FEE_OFFSET", "SUBSCRIPTION_OFFSET", "DISPUTE_WIN", "ONBOARDING", "CONNECT_BONUS", "USAGE_PURCHASE", "MARKETING_SPEND", "SPONSORED_PROMOTION", "SPONSORED_PROMOTION_REVERSAL"]) assert.ok(get(creditsEn, `reasons.${r}`), r);
  });
  it("never says money, cash out or withdraw as a promise", () => {
    assert.match(creditsEn.intro, /not cash/);
    for (const k of flat(creditsEn)) assert.ok(!/withdraw(?!n)|cash ?out|wallet/i.test(get(creditsEn, k).replace(/cannot be withdrawn/, "")), k);
  });
});

describe("Credit logic", () => {
  it("lots are listed in the order they are spent", () => {
    assert.deepEqual(lotsInSpendOrder([lot("c", "1", null), lot("b", "1", "2027-03-01T00:00:00Z"), lot("a", "1", "2027-01-01T00:00:00Z")]).map((l) => l.id), ["a", "b", "c"]);
  });
  it("days until expiry rounds up and never goes negative", () => {
    assert.equal(daysUntil(null, NOW), null);
    assert.equal(daysUntil("2026-12-21T09:00:00Z", NOW), 1);
    assert.equal(daysUntil("2026-12-19T00:00:00Z", NOW), 0);
  });
  it("banner: credit expiring within 30 days, summed; nothing when far away or empty", () => {
    assert.deepEqual(expiringSoon([lot("a", "40.00", "2027-01-05T00:00:00Z"), lot("b", "10.50", "2027-01-10T00:00:00Z"), lot("c", "99", "2027-09-01T00:00:00Z")], 30, NOW), { amount: 50.5, days: 16 });
    assert.equal(expiringSoon([lot("c", "99", "2027-09-01T00:00:00Z"), lot("d", "5", null)], 30, NOW), null);
    assert.equal(expiringSoon([], 30, NOW), null);
  });
  it("months and tones", () => {
    assert.deepEqual(recentMonths(3, new Date("2027-01-15T00:00:00Z")), ["2027-01", "2026-12", "2026-11"]);
    assert.equal(categoryTone("SERVICE_RECOVERY"), "success");
  });
});
