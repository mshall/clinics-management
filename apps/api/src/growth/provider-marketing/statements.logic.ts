import type { PdfSection } from "../../billing-platform/bilingual-pdf";

/**
 * GRW-P2-C commission statement v2: pure builders (tested without a database). One line per appointment that has a Kiorex commission decision or charge in
 * the month. Money is summed in minor units (piastres) so a total can never drift from its lines. A line never carries a patient name or phone.
 */
export type DecisionKind = "CHARGE" | "NO_CHARGE" | "WAIVED";
export type ChargeStatus = "PENDING" | "CONFIRMED" | "DISPUTED" | "REVERSED" | "WAIVED" | "BILLED";

export interface StatementLine {
  appointmentId: string;
  /** Appointment start, clinic-market local calendar day (YYYY-MM-DD). */
  date: string;
  isNewPatient: boolean;
  origin: string;
  bookingSource: string;
  decision: DecisionKind;
  reasonCodes: string[];
  /** Fee per the decision (minor units) or null when none. */
  rateMinor: number | null;
  /** Amount of the charge row (minor units) or null when there is no charge. */
  amountMinor: number | null;
  chargeStatus: ChargeStatus | null;
  /** OPEN | AUTO_APPROVED | APPROVED | REJECTED or null. */
  dispute: string | null;
}

export interface StatementTotals {
  /** Active charges: PENDING, CONFIRMED, BILLED and DISPUTED (a dispute does not remove a charge until it is approved). */
  activeMinor: number;
  activeCount: number;
  reversedMinor: number;
  waivedMinor: number;
  decisions: { CHARGE: number; NO_CHARGE: number; WAIVED: number };
  providerLed: number;
  disputesOpen: number;
}

const ACTIVE: ReadonlySet<ChargeStatus> = new Set(["PENDING", "CONFIRMED", "BILLED", "DISPUTED"]);
export const toMinor = (v: number | string | { toString(): string } | null | undefined): number | null => (v == null ? null : Math.round(Number(v.toString()) * 100));
export const fromMinor = (m: number): string => (m / 100).toFixed(2);

export function totalsOf(lines: StatementLine[]): StatementTotals {
  const t: StatementTotals = { activeMinor: 0, activeCount: 0, reversedMinor: 0, waivedMinor: 0, decisions: { CHARGE: 0, NO_CHARGE: 0, WAIVED: 0 }, providerLed: 0, disputesOpen: 0 };
  for (const l of lines) {
    t.decisions[l.decision] += 1;
    if (l.origin === "PROVIDER_LED") t.providerLed += 1;
    if (l.dispute === "OPEN") t.disputesOpen += 1;
    if (l.amountMinor == null || !l.chargeStatus) continue;
    if (ACTIVE.has(l.chargeStatus)) {
      t.activeMinor += l.amountMinor;
      t.activeCount += 1;
    } else if (l.chargeStatus === "REVERSED") t.reversedMinor += l.amountMinor;
    else if (l.chargeStatus === "WAIVED") t.waivedMinor += l.amountMinor;
  }
  return t;
}

/** `YYYY-MM` to the half-open instant range of that calendar month in the given IANA zone (Cairo by default: a visit at 00:30 on the 1st belongs to the new month). */
export function monthRange(month: string, zone = "Africa/Cairo"): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return { start: zonedMidnight(y, mo, 1, zone), end: zonedMidnight(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, 1, zone) };
}

/** UTC instant of local midnight at y-m-d in `zone` (handles DST: Cairo moves on the last Friday of April and October). */
export function zonedMidnight(y: number, m: number, d: number, zone: string): Date {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms;
  };
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);
  return new Date(ms);
}

export function localDay(at: Date, zone = "Africa/Cairo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const csvCell = (v: unknown): string => {
  let s = v == null ? "" : String(v);
  // spreadsheet formula injection: a cell that starts with = + - @ tab or CR is prefixed with a quote
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function statementCsv(month: string, currency: string, lines: StatementLine[], totals: StatementTotals): string {
  const head = ["date", "appointment", "new_patient", "origin", "source", "decision", "reasons", "rate", "amount", "charge_status", "dispute"];
  const rows = lines.map((l) => [l.date, l.appointmentId, l.isNewPatient ? "yes" : "no", l.origin, l.bookingSource, l.decision, l.reasonCodes.join("|"), l.rateMinor == null ? "" : fromMinor(l.rateMinor), l.amountMinor == null ? "" : fromMinor(l.amountMinor), l.chargeStatus ?? "", l.dispute ?? ""]);
  const foot = [["", "", "", "", "", "", "", "", "", "", ""], ["TOTAL", month, "", "", "", "", "", "", fromMinor(totals.activeMinor), `${totals.activeCount} active charges`, currency]];
  return `﻿${[head, ...rows, ...foot].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const L = {
  en: { title: "Kiorex commission statement", month: "Month", currency: "Currency", lines: "Lines", active: "Active charges", reversed: "Reversed", waived: "Waived", providerLed: "Bookings through your links (no fee)", disputes: "Open disputes", note: "Charges apply only to new patients who found you on Kiorex. Bookings through your own links never carry a Kiorex fee.", date: "Date", origin: "Origin", decision: "Decision", amount: "Amount", status: "Status" },
  ar: { title: "كشف عمولة كيوريكس", month: "الشهر", currency: "العملة", lines: "البنود", active: "الرسوم السارية", reversed: "رسوم ملغاة", waived: "رسوم مُعفاة", providerLed: "حجوزات عبر روابطك (بدون رسوم)", disputes: "اعتراضات مفتوحة", note: "تُطبَّق الرسوم فقط على المرضى الجدد الذين وجدوك عبر كيوريكس. الحجوزات عبر روابطك لا تتحمل أي رسوم من كيوريكس.", date: "التاريخ", origin: "المصدر", decision: "القرار", amount: "المبلغ", status: "الحالة" },
} as const;

export function statementPdfSections(month: string, currency: string, lines: StatementLine[], totals: StatementTotals): PdfSection[] {
  const sec = (lang: "en" | "ar"): PdfSection => {
    const t = L[lang];
    return {
      direction: lang === "ar" ? "rtl" : "ltr",
      rows: [
        { kind: "text", text: t.title, size: 16, bold: true },
        { kind: "gap", height: 6 },
        { kind: "pair", label: t.month, value: month },
        { kind: "pair", label: t.currency, value: currency },
        { kind: "pair", label: t.lines, value: String(lines.length) },
        { kind: "pair", label: `${t.active} (${totals.activeCount})`, value: fromMinor(totals.activeMinor), bold: true },
        { kind: "pair", label: t.reversed, value: fromMinor(totals.reversedMinor) },
        { kind: "pair", label: t.waived, value: fromMinor(totals.waivedMinor) },
        { kind: "pair", label: t.providerLed, value: String(totals.providerLed) },
        { kind: "pair", label: t.disputes, value: String(totals.disputesOpen) },
        { kind: "rule" },
        { kind: "columns", cells: [t.date, t.origin, t.decision, t.amount, t.status], widths: [0.2, 0.22, 0.2, 0.16, 0.22], size: 8, bold: true },
        ...lines.slice(0, 400).map((l) => ({ kind: "columns" as const, cells: [l.date, l.origin, l.decision, l.amountMinor == null ? "-" : fromMinor(l.amountMinor), l.chargeStatus ?? "-"], widths: [0.2, 0.22, 0.2, 0.16, 0.22], size: 8 })),
        { kind: "rule" },
        { kind: "text", text: t.note, size: 8 },
      ],
    };
  };
  return [sec("en"), sec("ar")];
}
