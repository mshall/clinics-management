import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { CreditEntryType, KiorlyLineType, Prisma, type CreditReason } from "@prisma/client";
import { MANUAL_GRANT_REASONS, SPENDABLE_ON, categoryOfReason, defaultExpiryFor, lotSpendableFor, namesPatientLedgerObject, reasonForFeeReturn, spendableOnFor } from "./credit-categories";
import { CreditFeeDrawdownService, useOfInvoiceLine } from "./credit-fee-drawdown.service";
import { applyCreditToCharges, simulateWalletOps, sortLotsFifo, spendableForUse, type CreditLotView } from "./credit-wallet-math";
import { buildCreditSection, type StatementLedgerRow } from "./credit-statement";

const D = (n: number | string) => new Prisma.Decimal(String(n));
const lot = (id: string, remaining: number, expires: string | null, reason: CreditReason = "GOODWILL", seq = 0, restrictions?: unknown): CreditLotView => ({ id, remaining: D(remaining), expiresAt: expires ? new Date(expires) : null, reason, seq, restrictions });
const AT = new Date("2027-01-01T00:00:00Z");

describe("GRW-P2-W categories and what credit can pay for", () => {
  it("every reason has a category and promotional categories always expire by default", () => {
    const reasons: CreditReason[] = ["KIOREX_LATE_REVERSAL", "REFERRAL", "PROMO", "NO_SHOW_GUARANTEE", "GOODWILL", "DOWNGRADE_PRORATION", "ADJUSTMENT", "DISPUTE_WIN", "ONBOARDING", "CONNECT_BONUS", "SPONSORED_PROMOTION_REVERSAL"];
    for (const r of reasons) assert.ok(categoryOfReason(r));
    assert.equal(categoryOfReason("DISPUTE_WIN"), "SERVICE_RECOVERY");
    assert.equal(categoryOfReason("CONNECT_BONUS"), "ONBOARDING");
    assert.equal(categoryOfReason("REFERRAL"), "REFERRAL");
    const from = new Date("2026-12-01T00:00:00Z");
    assert.equal(defaultExpiryFor("PROMOTIONAL", from).toISOString(), "2027-12-01T00:00:00.000Z");
    assert.equal(defaultExpiryFor("SERVICE_RECOVERY", from).toISOString(), "2028-12-01T00:00:00.000Z");
    assert.equal(defaultExpiryFor("PROMOTIONAL", from, { promotionalExpiryMonths: 6 }).toISOString(), "2027-06-01T00:00:00.000Z");
  });
  it("spendable-on list per category, restrictions narrow it and never widen it", () => {
    assert.ok(!SPENDABLE_ON.REFERRAL.includes("PROMOTIONS"));
    assert.ok(SPENDABLE_ON.SERVICE_RECOVERY.includes("PROMOTIONS"));
    assert.deepEqual(spendableOnFor(null, "GOODWILL", { spendableOn: ["KIOREX_FEES"] }), ["KIOREX_FEES"]);
    assert.deepEqual(spendableOnFor("REFERRAL", "REFERRAL", { spendableOn: ["PROMOTIONS", "KIOREX_FEES"] }), ["KIOREX_FEES"]);
    assert.equal(lotSpendableFor({ reason: "REFERRAL" }, "PROMOTIONS"), false);
  });
  it("fee return reasons: dispute win, goodwill waiver, generic late reversal", () => {
    assert.equal(reasonForFeeReturn("dispute_approved"), "DISPUTE_WIN");
    assert.equal(reasonForFeeReturn("override_goodwill_waiver"), "GOODWILL");
    assert.equal(reasonForFeeReturn("appointment_cancelled_or_no_show"), "KIOREX_LATE_REVERSAL");
  });
  it("W-8 guard: references naming a patient ledger object are recognised, provider references are not", () => {
    for (const bad of ["patient:abc", "reward:1", "sub:kx_1", "pcl_123", "coupon-9"]) assert.equal(namesPatientLedgerObject(bad), true, bad);
    for (const ok of ["dispute:ch_1", "connect:org1", "invoice:inv1:credit:KIOREX_FEES", "promotion:p1", "fee-return:c1", "cmwuw1", null]) assert.equal(namesPatientLedgerObject(ok as string | null), false, String(ok));
  });
  it("manual grants never use spend-side or engine-only reasons", () => {
    for (const r of ["KIOREX_FEE_OFFSET", "SUBSCRIPTION_OFFSET", "USAGE_PURCHASE", "MARKETING_SPEND", "SPONSORED_PROMOTION", "SPONSORED_PROMOTION_REVERSAL"]) assert.ok(!MANUAL_GRANT_REASONS.includes(r as CreditReason), r);
  });
});

describe("GRW-P2-W applyCreditToCharges (credit first, then the invoice)", () => {
  it("acceptance: a 999 credit against a billed commission of 400 pays 0", () => {
    const r = applyCreditToCharges([{ key: "c", use: "KIOREX_FEES", amount: D(400) }], [lot("a", 999, "2027-12-01T00:00:00Z")], AT);
    assert.equal(r.totalPayable.toFixed(2), "0.00");
    assert.equal(r.totalCredit.toFixed(2), "400.00");
  });
  it("first-expiring lot first, never more than the payable, remainder stays on the invoice", () => {
    const r = applyCreditToCharges(
      [{ key: "fees", use: "KIOREX_FEES", amount: D(300) }, { key: "sub", use: "SUBSCRIPTION", amount: D(500) }],
      [lot("late", 400, "2027-09-01T00:00:00Z"), lot("soon", 200, "2027-03-01T00:00:00Z")],
      AT,
    );
    assert.deepEqual(r.allocations.map((a) => [a.lotId, a.taken.toString(), a.lineKey]), [["soon", "200", "fees"], ["late", "100", "fees"], ["late", "300", "sub"]]);
    assert.equal(r.lines[1].payable.toFixed(2), "200.00");
    assert.equal(r.totalCredit.add(r.totalPayable).toFixed(2), "800.00");
  });
  it("expired lots and lots whose category cannot pay the use are skipped", () => {
    const r = applyCreditToCharges([{ key: "p", use: "PROMOTIONS", amount: D(100) }], [lot("exp", 100, "2026-12-31T00:00:00Z"), lot("ref", 100, "2027-06-01T00:00:00Z", "REFERRAL"), lot("ok", 60, "2027-07-01T00:00:00Z", "PROMO")], AT);
    assert.equal(r.totalCredit.toFixed(2), "60.00");
    assert.equal(r.totalPayable.toFixed(2), "40.00");
    assert.equal(spendableForUse([lot("ref", 100, null, "REFERRAL")], "PROMOTIONS", AT).toFixed(2), "0.00");
  });
  it("zero and negative lines never create credit; lots are not mutated", () => {
    const lots = [lot("a", 50, null)];
    const r = applyCreditToCharges([{ key: "z", use: "KIOREX_FEES", amount: D(0) }, { key: "n", use: "KIOREX_FEES", amount: D(-5) }], lots, AT);
    assert.equal(r.totalCredit.toFixed(2), "0.00");
    assert.equal(lots[0].remaining.toFixed(2), "50.00");
  });
  it("shared credit-ledger vectors (kiorex-contracts fixtures) reproduce: FIFO order, ties by lot id, expired lots skipped", () => {
    const file = join(__dirname, "fixtures", "credit-ledger-vectors.json");
    const v = JSON.parse(readFileSync(file, "utf8")) as { fifo: { name: string; now?: string; lots: { id: string; remainingMinor: number; expiresAt: string; scoped?: boolean }[]; consumeMinor: number; expected: { lotId: string; minor: number }[] | null }[] };
    let ran = 0;
    for (const c of v.fifo) {
      if (c.lots.some((l) => l.scoped !== undefined)) continue; // scoped lots are a patient-credit concept (campaign scope): not part of provider credit
      const at = new Date(c.now ?? "2027-01-01T00:00:00Z");
      const lots = c.lots.map((l, i) => lot(l.id, l.remainingMinor / 100, l.expiresAt, "GOODWILL", i));
      const r = applyCreditToCharges([{ key: "x", use: "KIOREX_FEES", amount: D(c.consumeMinor / 100) }], lots, at);
      if (c.expected === null) { assert.ok(r.totalPayable.gt(0), c.name); } else {
        assert.deepEqual(r.allocations.map((a) => ({ lotId: a.lotId, minor: Math.round(Number(a.taken) * 100) })), c.expected, c.name);
      }
      ran += 1;
    }
    assert.ok(ran >= 5);
    const sibling = resolve(__dirname, "../../../../../kiorex-contracts/fixtures/credit-ledger-vectors.json");
    if (existsSync(sibling)) assert.deepEqual(JSON.parse(readFileSync(sibling, "utf8")).fifo, v.fifo, "vendored vectors drifted from kiorex-contracts");
  });
  it("sortLotsFifo: no expiry last, ties by id", () => {
    assert.deepEqual(sortLotsFifo([lot("z", 1, null), lot("b", 1, "2027-02-01T00:00:00Z"), lot("a", 1, "2027-02-01T00:00:00Z")]).map((l) => l.id), ["a", "b", "z"]);
  });
  it("property: random charges and lots keep credit + payable = amount, credit <= lots, nothing negative (300 rounds)", () => {
    let seed = 7; const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let n = 0; n < 300; n++) {
      const lots = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => lot(`l${i}`, Math.round(rnd() * 500) / 10, rnd() < 0.3 ? null : new Date(AT.getTime() + (rnd() * 400 - 50) * 86_400_000).toISOString(), (["GOODWILL", "REFERRAL", "PROMO", "ONBOARDING"] as CreditReason[])[Math.floor(rnd() * 4)], i));
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) => ({ key: `k${i}`, use: (["KIOREX_FEES", "SUBSCRIPTION", "PROMOTIONS"] as const)[Math.floor(rnd() * 3)], amount: D(Math.round(rnd() * 800) / 10) }));
      const r = applyCreditToCharges(lines, lots, AT);
      for (const l of r.lines) { assert.ok(l.credit.gte(0) && l.payable.gte(0)); assert.ok(l.credit.add(l.payable).equals(l.amount)); }
      const usable = lots.filter((l) => !l.expiresAt || l.expiresAt > AT).reduce((s, l) => s.add(l.remaining), D(0));
      assert.ok(r.totalCredit.lte(usable));
      const perLot = new Map<string, Prisma.Decimal>();
      for (const a of r.allocations) perLot.set(a.lotId, (perLot.get(a.lotId) ?? D(0)).add(a.taken));
      for (const l of lots) assert.ok((perLot.get(l.id) ?? D(0)).lte(l.remaining));
    }
  });
  it("property W-7: random grant, consume and expire operations keep Sigma ledger = balance and balance >= 0", () => {
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let n = 0; n < 100; n++) {
      const ops: Parameters<typeof simulateWalletOps>[0] = [];
      let bal = 0;
      for (let i = 0; i < 12; i++) {
        const k = rnd();
        if (k < 0.5) { const a = 1 + Math.floor(rnd() * 100); bal += a; ops.push({ kind: "grant", amount: a, expiresAt: rnd() < 0.5 ? null : new Date(AT.getTime() + rnd() * 1e10) }); }
        else if (k < 0.85 && bal > 1) { const a = 1 + Math.floor(rnd() * (bal - 1)); bal -= a; ops.push({ kind: "consume", amount: a }); }
      }
      const { balance, entries } = simulateWalletOps(ops);
      assert.ok(balance.gte(0));
      assert.ok(entries.filter((e) => e.type === CreditEntryType.GRANT).reduce((s, e) => s.add(e.remaining ?? 0), D(0)).equals(balance));
    }
  });
});

describe("GRW-P2-W invoice split (commission and subscription drawn separately)", () => {
  const svc = new CreditFeeDrawdownService(null as never);
  it("line types map to uses; tax, discounts and credit lines are never paid by credit", () => {
    assert.equal(useOfInvoiceLine(KiorlyLineType.KIOREX_COMMISSION), "KIOREX_FEES");
    assert.equal(useOfInvoiceLine(KiorlyLineType.KIOREX_COMMISSION_OFFSET), "KIOREX_FEES");
    assert.equal(useOfInvoiceLine(KiorlyLineType.SEAT), "SUBSCRIPTION");
    for (const t of [KiorlyLineType.TAX, KiorlyLineType.DISCOUNT, KiorlyLineType.CREDIT]) assert.equal(useOfInvoiceLine(t), null);
  });
  it("higher-of: commission 400 with an offset of 300 and a subscription of 300 nets 100 fees and 300 subscription", () => {
    const lines = [
      { type: KiorlyLineType.SUBSCRIPTION, amount: D(300) },
      { type: KiorlyLineType.KIOREX_COMMISSION, amount: D(400) },
      { type: KiorlyLineType.KIOREX_COMMISSION_OFFSET, amount: D(-300) },
    ];
    const a = svc.splitCredit(lines, D(999));
    assert.equal(a.byUse.get("KIOREX_FEES")?.toFixed(2), "100.00");
    assert.equal(a.byUse.get("SUBSCRIPTION")?.toFixed(2), "300.00");
    assert.equal(a.other.toFixed(2), "599.00");
    const b = svc.splitCredit(lines, D(150));
    assert.equal(b.byUse.get("KIOREX_FEES")?.toFixed(2), "100.00");
    assert.equal(b.byUse.get("SUBSCRIPTION")?.toFixed(2), "50.00");
    assert.equal(b.other.toFixed(2), "0.00");
  });
});

describe("GRW-P2-W credit section of the statement reconciles to the ledger", () => {
  const row = (type: CreditEntryType, reason: CreditReason, amount: number, at: string): StatementLedgerRow => ({ type, reason, amount: D(amount), createdAt: new Date(at) });
  it("opening + grants - use - expiries = closing, by reason, category and use", () => {
    const rows = [
      row("GRANT", "ONBOARDING", 500, "2026-10-05T00:00:00Z"),
      row("GRANT", "DISPUTE_WIN", 40, "2026-11-03T00:00:00Z"),
      row("GRANT", "CONNECT_BONUS", 100, "2026-11-04T00:00:00Z"),
      row("CONSUME", "KIOREX_FEE_OFFSET", -120, "2026-11-10T00:00:00Z"),
      row("CONSUME", "SUBSCRIPTION_OFFSET", -80, "2026-11-10T00:00:00Z"),
      row("CONSUME", "SPONSORED_PROMOTION", -50, "2026-11-12T00:00:00Z"),
      row("GRANT", "SPONSORED_PROMOTION_REVERSAL", 50, "2026-11-20T00:00:00Z"),
      row("EXPIRE", "ADJUSTMENT", -10, "2026-11-28T00:00:00Z"),
      row("GRANT", "GOODWILL", 999, "2026-12-02T00:00:00Z"),
    ];
    const s = buildCreditSection(rows, new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    assert.equal(s.opening, "500.00");
    assert.equal(s.grantsByReason.DISPUTE_WIN, "40.00");
    assert.equal(s.grantsByCategory.ONBOARDING, "100.00");
    assert.equal(s.returns, "90.00");
    assert.deepEqual(s.consumptionByUse, { KIOREX_FEES: "120.00", PROMOTIONS: "50.00", SUBSCRIPTION: "80.00" });
    assert.equal(s.expiries, "10.00");
    assert.equal(s.closing, "430.00");
    assert.equal(s.reconciles, true);
  });
});

describe("GRW-P2-W W-1 / W-2 / W-3 structural guards", () => {
  const dir = __dirname;
  const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === "fixtures" ? [] : files(p)) : p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : []; });
  it("W-1: credits/* imports no marketplace, Kiorex Pay or deposit payment code", () => {
    for (const f of files(dir)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/from\s+"([^"]+)"/g)) assert.ok(!/marketplace|deposit|kiorex-pay|payment-gateways|patients\//.test(m[1]), `${f} imports ${m[1]}`);
    }
  });
  it("W-1/W-8: no patient column on the wallet tables", () => {
    const schema = readFileSync(resolve(dir, "../../prisma/schema.prisma"), "utf8");
    for (const model of ["CreditWallet", "CreditLedgerEntry", "CreditReservation", "UsageUnitLedger", "CreditReconcileRun"]) {
      const body = new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
      assert.ok(body.length > 20, model);
      assert.ok(!/patient|\bsub\b|deposit/i.test(body.replace(/\/\/\/.*$/gm, "")), `${model} must not carry a patient column`);
    }
  });
  it("W-2/W-3: no service method takes a second tenant id and nothing pays credit out as money", () => {
    for (const f of files(dir)) {
      const src = readFileSync(f, "utf8");
      assert.ok(!/toTenantId|fromTenantId|targetTenantId|transfer\(|payout|cashOut|withdraw/i.test(src), f);
    }
  });
  it("the controller is read-only for wallet and statement (no grant endpoint for providers)", () => {
    const src = readFileSync(join(dir, "credits.controller.ts"), "utf8");
    assert.equal((src.match(/@Post\(/g) ?? []).length, 1); // only the usage bundle purchase
  });
});
