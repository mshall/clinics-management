import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBilingualPdf } from "../../billing-platform/bilingual-pdf";
import { fromMinor, localDay, monthRange, statementCsv, statementPdfSections, toMinor, totalsOf, zonedMidnight, type StatementLine } from "./statements.logic";

const line = (o: Partial<StatementLine>): StatementLine => ({ appointmentId: "a1", date: "2026-11-05", isNewPatient: true, origin: "MARKETPLACE", bookingSource: "KIOREX_MARKETPLACE", decision: "CHARGE", reasonCodes: ["KIOREX_NEW_PATIENT"], rateMinor: 4000, amountMinor: 4000, chargeStatus: "CONFIRMED", dispute: null, ...o });

describe("GRW-P2-C statements v2", () => {
  const lines: StatementLine[] = [
    line({ appointmentId: "a1" }),
    line({ appointmentId: "a2", amountMinor: 4000, chargeStatus: "BILLED" }),
    line({ appointmentId: "a3", amountMinor: 4000, chargeStatus: "DISPUTED", dispute: "OPEN" }),
    line({ appointmentId: "a4", amountMinor: 4000, chargeStatus: "REVERSED" }),
    line({ appointmentId: "a5", amountMinor: 4000, chargeStatus: "WAIVED", decision: "WAIVED" }),
    line({ appointmentId: "a6", origin: "PROVIDER_LED", decision: "NO_CHARGE", rateMinor: null, amountMinor: null, chargeStatus: null, isNewPatient: true, reasonCodes: ["PROVIDER_LED"] }),
  ];
  it("totals are the sum of the lines in minor units (active = pending, confirmed, billed, disputed)", () => {
    const t = totalsOf(lines);
    assert.equal(t.activeMinor, 12000);
    assert.equal(t.activeCount, 3);
    assert.equal(t.reversedMinor, 4000);
    assert.equal(t.waivedMinor, 4000);
    assert.equal(t.providerLed, 1);
    assert.equal(t.disputesOpen, 1);
    assert.deepEqual(t.decisions, { CHARGE: 4, NO_CHARGE: 1, WAIVED: 1 });
  });
  it("money never drifts: 0.1 + 0.2 style sums are exact in minor units", () => {
    assert.equal(toMinor("0.10")! + toMinor("0.20")!, 30);
    assert.equal(fromMinor(toMinor("40.00")! * 3), "120.00");
    assert.equal(toMinor(null), null);
  });
  it("month boundaries follow the market's local calendar (Cairo is UTC+2 in winter)", () => {
    const r = monthRange("2026-11", "Africa/Cairo")!;
    assert.equal(r.start.toISOString(), "2026-10-31T22:00:00.000Z");
    assert.equal(r.end.toISOString(), "2026-11-30T22:00:00.000Z");
    // a visit at 00:30 Cairo on 1 December belongs to December, at 23:30 on 30 November to November
    assert.equal(localDay(new Date("2026-11-30T22:30:00Z"), "Africa/Cairo"), "2026-12-01");
    assert.equal(localDay(new Date("2026-11-30T21:30:00Z"), "Africa/Cairo"), "2026-11-30");
  });
  it("summer time: Cairo is UTC+3 from the last Friday of April 2027", () => {
    assert.equal(zonedMidnight(2027, 7, 1, "Africa/Cairo").toISOString(), "2027-06-30T21:00:00.000Z");
    assert.equal(monthRange("2027-04", "Africa/Cairo")!.end.toISOString(), "2027-04-30T21:00:00.000Z");
  });
  it("December to January and invalid months", () => {
    assert.equal(monthRange("2026-12", "Africa/Cairo")!.end.toISOString(), "2026-12-31T22:00:00.000Z");
    assert.equal(monthRange("2026-13"), null);
    assert.equal(monthRange("26-11"), null);
  });
  it("CSV has a BOM, a header, one row per line, a total row, and neutralises formula injection", () => {
    const csv = statementCsv("2026-11", "EGP", [line({ appointmentId: "=HYPERLINK(1)" })], totalsOf([line({})]));
    assert.ok(csv.startsWith("﻿date,appointment"));
    assert.ok(csv.includes("'=HYPERLINK(1)"));
    assert.ok(csv.includes("TOTAL,2026-11"));
    assert.equal(csv.split("\r\n").filter(Boolean).length, 1 + 1 + 2);
  });
  it("PDF is a real bilingual PDF whose totals equal the totals of the lines", () => {
    const t = totalsOf(lines);
    const sections = statementPdfSections("2026-11", "EGP", lines, t);
    const texts = JSON.stringify(sections);
    assert.ok(texts.includes(fromMinor(t.activeMinor)));
    assert.equal(sections[0]!.direction, "ltr");
    assert.equal(sections[1]!.direction, "rtl");
    const pdf = buildBilingualPdf(sections);
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(pdf.length > 1500);
  });
  it("a line carries no patient name or phone", () => {
    const keys = Object.keys(lines[0]!).join(",");
    assert.ok(!/patient(Name|Id)|phone|firstName|lastName/i.test(keys));
  });
});
