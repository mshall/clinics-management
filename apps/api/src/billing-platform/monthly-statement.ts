import { CREDIT_LABELS, type CreditSection } from "../credits/credit-statement";
import { KiorlyLineType } from "@prisma/client";
import { buildBilingualPdf, type PdfRow, type PdfSection } from "./bilingual-pdf";
import type { SettlementCalculatorResult } from "./settlement-calculator";
import { roundMoney } from "./settlement-rounding";

export const STATEMENT_READY_TOPIC = "billing.monthly_statement_ready";

export type StatementSourceLine = {
  type: KiorlyLineType;
  descEn: string;
  descAr: string;
  amount: number | string;
  refId?: string | null;
};

export type StatementPatientRow = {
  chargeId: string;
  attendedAt: string;
  doctorName: string;
  patientInitials: string;
  fee: string;
};

export type StatementPaymentRow = {
  id: string;
  createdAt: string;
  provider: string;
  amount: string;
  currency: string;
  status: string;
};

export type StatementInvoiceRef = {
  id: string;
  number: string;
  status: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

export type MonthlyStatementSource = {
  periodKey: string;
  currency: string;
  /** null when the period has no invoice yet (statement is a dry-run preview). */
  invoice: StatementInvoiceRef | null;
  lines: StatementSourceLine[];
  creditsApplied: number | string;
  tax: number | string;
  amountPaid: number | string;
  /** Persisted invoice totals (or calculator totals for previews) used to prove reconciliation. */
  expected: { subtotal: number | string; total: number | string };
  patients: StatementPatientRow[];
  payments: StatementPaymentRow[];
  walletBalance: number | string;
  vatRatePercent: number;
  explanationEn: string | null;
  explanationAr: string | null;
  skippedBelowMinimum?: boolean;
  carryForwardOut?: string;
};

export type MonthlyStatementDto = {
  periodKey: string;
  currency: string;
  preview: boolean;
  invoice: StatementInvoiceRef | null;
  subscription: { subscription: string; seats: string; addons: string; usage: string; total: string };
  kiorexPatients: StatementPatientRow[];
  kiorexPatientCount: number;
  commissionTotal: string;
  carryForwardIn: string;
  offset: string;
  prepaid: string;
  otherAdjustments: string;
  subtotal: string;
  creditsUsed: string;
  walletBalance: string;
  netPayable: string;
  vatRatePercent: number;
  vat: string;
  total: string;
  amountPaid: string;
  amountDue: string;
  payments: StatementPaymentRow[];
  explanationEn: string | null;
  explanationAr: string | null;
  skippedBelowMinimum: boolean;
  carryForwardOut: string;
  reconciles: boolean;
  /** GRW-P2-W: credit section (flag clinic.provider_credit_v2); absent when the wallet has never been used. */
  credit?: CreditSection & { currency: string };
};

const CARRY_FORWARD_REF = "carry-forward";

function num(v: number | string): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v: number): string {
  return roundMoney(v).toFixed(2);
}

function sumLines(lines: StatementSourceLine[], pick: (l: StatementSourceLine) => boolean): number {
  return roundMoney(lines.filter(pick).reduce((s, l) => s + roundMoney(num(l.amount)), 0));
}

/** Break invoice lines into the statement components an owner reads (CR-11). */
export function buildMonthlyStatement(src: MonthlyStatementSource): MonthlyStatementDto {
  const lines = src.lines;
  const subscription = sumLines(lines, (l) => l.type === KiorlyLineType.SUBSCRIPTION);
  const seats = sumLines(lines, (l) => l.type === KiorlyLineType.SEAT);
  const addons = sumLines(lines, (l) => l.type === KiorlyLineType.ADDON);
  const usage = sumLines(lines, (l) => l.type === KiorlyLineType.USAGE_OVERAGE);
  const commission = sumLines(
    lines,
    (l) => l.type === KiorlyLineType.KIOREX_COMMISSION && l.refId !== CARRY_FORWARD_REF,
  );
  const carryIn = sumLines(
    lines,
    (l) => l.type === KiorlyLineType.KIOREX_COMMISSION && l.refId === CARRY_FORWARD_REF,
  );
  const offset = -sumLines(lines, (l) => l.type === KiorlyLineType.KIOREX_COMMISSION_OFFSET);
  const prepaid = -sumLines(lines, (l) => l.type === KiorlyLineType.PREPAID);
  const known = new Set<KiorlyLineType>([
    KiorlyLineType.SUBSCRIPTION,
    KiorlyLineType.SEAT,
    KiorlyLineType.ADDON,
    KiorlyLineType.USAGE_OVERAGE,
    KiorlyLineType.KIOREX_COMMISSION,
    KiorlyLineType.KIOREX_COMMISSION_OFFSET,
    KiorlyLineType.PREPAID,
    KiorlyLineType.TAX,
  ]);
  const other = sumLines(lines, (l) => !known.has(l.type));
  const vatFromLines = sumLines(lines, (l) => l.type === KiorlyLineType.TAX);

  const subtotal = roundMoney(
    subscription + seats + addons + usage + commission + carryIn - offset - prepaid + other,
  );
  const creditsUsed = roundMoney(num(src.creditsApplied));
  const netPayable = roundMoney(subtotal - creditsUsed);
  const vat = roundMoney(num(src.tax));
  const total = roundMoney(netPayable + vat);
  const amountPaid = roundMoney(num(src.amountPaid));

  const reconciles =
    Math.abs(subtotal - roundMoney(num(src.expected.subtotal))) < 0.005 &&
    Math.abs(total - roundMoney(num(src.expected.total))) < 0.005 &&
    (vatFromLines === 0 || Math.abs(vatFromLines - vat) < 0.005);

  return {
    periodKey: src.periodKey,
    currency: src.currency,
    preview: src.invoice == null,
    invoice: src.invoice,
    subscription: {
      subscription: money(subscription),
      seats: money(seats),
      addons: money(addons),
      usage: money(usage),
      total: money(subscription + seats + addons + usage),
    },
    kiorexPatients: src.patients,
    kiorexPatientCount: src.patients.length,
    commissionTotal: money(commission),
    carryForwardIn: money(carryIn),
    offset: money(offset),
    prepaid: money(prepaid),
    otherAdjustments: money(other),
    subtotal: money(subtotal),
    creditsUsed: money(creditsUsed),
    walletBalance: money(num(src.walletBalance)),
    netPayable: money(netPayable),
    vatRatePercent: src.vatRatePercent,
    vat: money(vat),
    total: money(total),
    amountPaid: money(amountPaid),
    amountDue: money(Math.max(total - amountPaid, 0)),
    payments: src.payments,
    explanationEn: src.explanationEn,
    explanationAr: src.explanationAr,
    skippedBelowMinimum: src.skippedBelowMinimum ?? false,
    carryForwardOut: src.carryForwardOut ?? "0.00",
    reconciles,
  };
}

/** Statement source from a pure settlement result (dry-run preview, and CR-06 matrix tests). */
export function statementSourceFromSettlement(
  periodKey: string,
  currency: string,
  taxRatePercent: number,
  result: SettlementCalculatorResult,
  extras: Partial<Pick<MonthlyStatementSource, "patients" | "payments" | "walletBalance" | "invoice">> = {},
): MonthlyStatementSource {
  return {
    periodKey,
    currency,
    invoice: extras.invoice ?? null,
    lines: result.lines,
    creditsApplied: result.creditsApplied,
    tax: result.tax,
    amountPaid: 0,
    expected: { subtotal: result.subtotal, total: result.total },
    patients: extras.patients ?? [],
    payments: extras.payments ?? [],
    walletBalance: extras.walletBalance ?? 0,
    vatRatePercent: taxRatePercent,
    explanationEn: result.summary.explanationEn,
    explanationAr: result.summary.explanationAr,
    skippedBelowMinimum: result.summary.skippedBelowMinimum,
    carryForwardOut: result.summary.carryForwardOut,
  };
}

type StatementLabels = {
  title: string;
  period: string;
  invoice: string;
  status: string;
  preview: string;
  subscription: string;
  seats: string;
  addons: string;
  usage: string;
  patients: string;
  date: string;
  doctor: string;
  initials: string;
  fee: string;
  noPatients: string;
  commissionTotal: string;
  carryIn: string;
  offset: string;
  prepaid: string;
  other: string;
  subtotal: string;
  credits: string;
  wallet: string;
  netPayable: string;
  vat: string;
  total: string;
  payments: string;
  noPayments: string;
  paid: string;
  due: string;
};

const LABELS_EN: StatementLabels = {
  title: "Kiorly monthly statement",
  period: "Period",
  invoice: "Invoice",
  status: "Status",
  preview: "Preview (not yet invoiced)",
  subscription: "Subscription",
  seats: "Extra clinician seats",
  addons: "Add-ons",
  usage: "Usage overage",
  patients: "Kiorex patients",
  date: "Date",
  doctor: "Doctor",
  initials: "Patient",
  fee: "Fee",
  noPatients: "No Kiorex patients this period.",
  commissionTotal: "Commission total",
  carryIn: "Carried forward from prior periods",
  offset: "Offset (higher-of, never both)",
  prepaid: "Prepaid period",
  other: "Other adjustments",
  subtotal: "Subtotal",
  credits: "Credits used",
  wallet: "Wallet balance",
  netPayable: "Net payable",
  vat: "VAT",
  total: "Total",
  payments: "Payments",
  noPayments: "No payments recorded.",
  paid: "Paid",
  due: "Amount due",
};

const LABELS_AR: StatementLabels = {
  title: "كشف حساب كيورلي الشهري",
  period: "الفترة",
  invoice: "الفاتورة",
  status: "الحالة",
  preview: "معاينة (لم تصدر فاتورة بعد)",
  subscription: "الاشتراك",
  seats: "مقاعد أطباء إضافية",
  addons: "الإضافات",
  usage: "تجاوز الاستخدام",
  patients: "مرضى كيوركس",
  date: "التاريخ",
  doctor: "الطبيب",
  initials: "المريض",
  fee: "الرسوم",
  noPatients: "لا يوجد مرضى من كيوركس في هذه الفترة.",
  commissionTotal: "إجمالي العمولة",
  carryIn: "رصيد مرحّل من فترات سابقة",
  offset: "الخصم (الأعلى فقط وليس المجموع)",
  prepaid: "فترة مدفوعة مسبقاً",
  other: "تسويات أخرى",
  subtotal: "المجموع الفرعي",
  credits: "الأرصدة المستخدمة",
  wallet: "رصيد المحفظة",
  netPayable: "صافي المستحق",
  vat: "ضريبة القيمة المضافة",
  total: "الإجمالي",
  payments: "المدفوعات",
  noPayments: "لا توجد مدفوعات مسجلة.",
  paid: "المدفوع",
  due: "المبلغ المستحق",
};

function statementSection(st: MonthlyStatementDto, lang: "en" | "ar"): PdfSection {
  const L = lang === "ar" ? LABELS_AR : LABELS_EN;
  const c = st.currency;
  const amt = (v: string) => `${v} ${c}`;
  const neg = (v: string) => (Number(v) > 0 ? `-${v} ${c}` : `${v} ${c}`);
  const rows: PdfRow[] = [
    { kind: "text", text: L.title, size: 16, bold: true },
    { kind: "pair", label: L.period, value: st.periodKey },
    { kind: "pair", label: L.invoice, value: st.invoice?.number ?? L.preview },
  ];
  if (st.invoice) rows.push({ kind: "pair", label: L.status, value: st.invoice.status });
  const explanation = lang === "ar" ? st.explanationAr : st.explanationEn;
  if (explanation) rows.push({ kind: "gap" }, { kind: "text", text: explanation, size: 9 });
  rows.push({ kind: "gap" }, { kind: "rule" });

  rows.push({ kind: "pair", label: L.subscription, value: amt(st.subscription.subscription) });
  if (Number(st.subscription.seats) !== 0) rows.push({ kind: "pair", label: L.seats, value: amt(st.subscription.seats) });
  if (Number(st.subscription.addons) !== 0) rows.push({ kind: "pair", label: L.addons, value: amt(st.subscription.addons) });
  if (Number(st.subscription.usage) !== 0) rows.push({ kind: "pair", label: L.usage, value: amt(st.subscription.usage) });

  rows.push({ kind: "gap" }, { kind: "text", text: `${L.patients} (${st.kiorexPatientCount})`, size: 11, bold: true });
  if (st.kiorexPatients.length === 0) {
    rows.push({ kind: "text", text: L.noPatients, size: 9 });
  } else {
    const widths = [2, 4, 2, 2];
    rows.push({ kind: "columns", cells: [L.date, L.doctor, L.initials, L.fee], widths, size: 9, bold: true });
    for (const p of st.kiorexPatients) {
      rows.push({
        kind: "columns",
        cells: [p.attendedAt.slice(0, 10), p.doctorName, p.patientInitials, amt(p.fee)],
        widths,
        size: 9,
      });
    }
  }
  rows.push({ kind: "pair", label: L.commissionTotal, value: amt(st.commissionTotal), bold: true });
  if (Number(st.carryForwardIn) !== 0) rows.push({ kind: "pair", label: L.carryIn, value: amt(st.carryForwardIn) });

  rows.push({ kind: "gap" }, { kind: "rule" });
  rows.push({ kind: "pair", label: L.offset, value: neg(st.offset) });
  if (Number(st.prepaid) !== 0) rows.push({ kind: "pair", label: L.prepaid, value: neg(st.prepaid) });
  if (Number(st.otherAdjustments) !== 0) rows.push({ kind: "pair", label: L.other, value: amt(st.otherAdjustments) });
  rows.push({ kind: "pair", label: L.subtotal, value: amt(st.subtotal) });
  rows.push({ kind: "pair", label: L.credits, value: neg(st.creditsUsed) });
  rows.push({ kind: "pair", label: L.wallet, value: amt(st.walletBalance) });
  rows.push({ kind: "pair", label: L.netPayable, value: amt(st.netPayable) });
  rows.push({ kind: "pair", label: `${L.vat} (${st.vatRatePercent}%)`, value: amt(st.vat) });
  rows.push({ kind: "pair", label: L.total, value: amt(st.total), size: 12, bold: true });

  if (st.credit) {
    const C = CREDIT_LABELS[lang];
    const cr = st.credit;
    rows.push({ kind: "gap" }, { kind: "rule" }, { kind: "text", text: C.title, size: 11, bold: true });
    rows.push({ kind: "pair", label: C.opening, value: amt(cr.opening), size: 9 });
    const grants = Object.entries(cr.grantsByReason);
    rows.push({ kind: "pair", label: C.grants, value: amt(grants.reduce((n, [, v]) => n + Number(v), 0).toFixed(2)), size: 9 });
    for (const [reason, v] of grants) rows.push({ kind: "pair", label: `  ${reason}`, value: amt(v), size: 8 });
    if (Number(cr.returns) !== 0) rows.push({ kind: "pair", label: C.returns, value: amt(cr.returns), size: 8 });
    rows.push({ kind: "pair", label: C.consumed, value: neg(cr.consumed), size: 9 });
    for (const [use, v] of Object.entries(cr.consumptionByUse)) rows.push({ kind: "pair", label: `  ${(C.uses as Record<string, string>)[use] ?? use}`, value: neg(v), size: 8 });
    if (Number(cr.expiries) !== 0) rows.push({ kind: "pair", label: C.expiries, value: neg(cr.expiries), size: 9 });
    rows.push({ kind: "pair", label: C.closing, value: amt(cr.closing), size: 9, bold: true });
  }

  rows.push({ kind: "gap" }, { kind: "text", text: L.payments, size: 11, bold: true });
  if (st.payments.length === 0) {
    rows.push({ kind: "text", text: L.noPayments, size: 9 });
  } else {
    for (const pay of st.payments) {
      rows.push({
        kind: "pair",
        label: `${pay.createdAt.slice(0, 10)} · ${pay.provider} · ${pay.status}`,
        value: `${pay.amount} ${pay.currency}`,
        size: 9,
      });
    }
  }
  rows.push({ kind: "pair", label: L.paid, value: amt(st.amountPaid) });
  rows.push({ kind: "pair", label: L.due, value: amt(st.amountDue), bold: true });

  return { direction: lang === "ar" ? "rtl" : "ltr", rows };
}

/** Bilingual statement PDF: English section followed by Arabic (RTL) section. */
export function renderMonthlyStatementPdf(st: MonthlyStatementDto): Buffer {
  return buildBilingualPdf([statementSection(st, "en"), statementSection(st, "ar")]);
}
