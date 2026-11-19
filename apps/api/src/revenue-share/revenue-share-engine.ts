export const RULE_TYPES = ["PERCENT", "FIXED_PER_VISIT", "ROOM_RENTAL"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export type ShareRule = {
  id: string;
  clinicianId: string | null;
  clinicId: string | null;
  appointmentTypeId: string | null;
  revenueCategory: string | null;
  payerKey: string | null;
  ruleType: string;
  percent: number | null;
  fixedAmount: number | null;
  roomRental: boolean;
  priority: number;
  createdAt: Date;
};

/** One collected revenue row attributed to a doctor. Refund rows carry negative amounts. */
export type ShareLine = {
  id: string;
  clinicianId: string;
  clinicId: string;
  appointmentTypeId: string | null;
  category: string;
  payerKey: string;
  /** Encounter / appointment / operation the money belongs to — one "visit". */
  visitKey: string;
  gross: number;
  net: number;
};

export type Adjustment = { amount: number; note: string; at: string; byUserId: string };
export type Payout = { amount: number; method: string; reference: string | null; at: string; byUserId: string };

type Breakdown = { key: string; visits: number; collectedNet: number; doctorShare: number };

export type StatementTotals = {
  visits: number;
  collectedGross: number;
  collectedNet: number;
  doctorShareFromLines: number;
  roomRental: number;
  doctorShare: number;
  clinicShare: number;
  adjustments: number;
  payouts: number;
  netPayable: number;
  /** Net collections no rule matched — kept by the clinic, flagged for the owner. */
  unmatchedNet: number;
  rentalRuleId: string | null;
  byService: Breakdown[];
  byPayer: Breakdown[];
  lineCount: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function isRental(rule: ShareRule): boolean {
  return rule.roomRental || rule.ruleType === "ROOM_RENTAL";
}

/** Specificity: clinician 8, appointment type 4, revenue category 2, payer 2, clinic 1 — then priority, then newest. */
function score(rule: ShareRule): number {
  return (
    (rule.clinicianId ? 8 : 0) +
    (rule.appointmentTypeId ? 4 : 0) +
    (rule.revenueCategory ? 2 : 0) +
    (rule.payerKey ? 2 : 0) +
    (rule.clinicId ? 1 : 0)
  );
}

function byPrecedence(a: ShareRule, b: ShareRule): number {
  return score(b) - score(a) || b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime();
}

function matches(rule: ShareRule, line: Pick<ShareLine, "clinicianId" | "clinicId" | "appointmentTypeId" | "category" | "payerKey">) {
  return (
    (!rule.clinicianId || rule.clinicianId === line.clinicianId) &&
    (!rule.clinicId || rule.clinicId === line.clinicId) &&
    (!rule.appointmentTypeId || rule.appointmentTypeId === line.appointmentTypeId) &&
    (!rule.revenueCategory || rule.revenueCategory === line.category) &&
    (!rule.payerKey || rule.payerKey === line.payerKey)
  );
}

/** The share rule for a revenue line (percent or fixed per visit); room-rental rules never match lines. */
export function pickLineRule(line: ShareLine, rules: ShareRule[]): ShareRule | null {
  return rules.filter((r) => !isRental(r) && matches(r, line)).sort(byPrecedence)[0] ?? null;
}

/** The doctor's room-rental rule for the period (clinician-specific beats the clinic default). */
export function pickRentalRule(clinicianId: string, rules: ShareRule[]): ShareRule | null {
  return (
    rules
      .filter((r) => isRental(r) && (!r.clinicianId || r.clinicianId === clinicianId) && !r.appointmentTypeId && !r.revenueCategory && !r.payerKey)
      .sort(byPrecedence)[0] ?? null
  );
}

/**
 * Doctor share for one period from *collected* revenue:
 * - PERCENT: percent × net collected on the matching lines;
 * - FIXED_PER_VISIT: fixed amount per visit whose matching net collection is positive;
 * - ROOM_RENTAL doctors keep 100 % of unmatched collections and pay the rental to the clinic;
 * - nothing matched and no rental → the clinic keeps it (reported as `unmatchedNet`).
 */
export function computeStatement(lines: ShareLine[], rules: ShareRule[], adjustments: Adjustment[], payouts: Payout[]): StatementTotals {
  const clinicianId = lines[0]?.clinicianId ?? null;
  const rental = clinicianId ? pickRentalRule(clinicianId, rules) : null;
  const visits = new Map<string, number>();
  const fixedVisits = new Map<string, { net: number; amount: number; serviceKey: string; payerKey: string }>();
  const service = new Map<string, Breakdown & { visitKeys: Set<string> }>();
  const payer = new Map<string, Breakdown & { visitKeys: Set<string> }>();
  let gross = 0;
  let net = 0;
  let shareFromLines = 0;
  let unmatched = 0;

  const bump = (m: Map<string, Breakdown & { visitKeys: Set<string> }>, key: string, line: ShareLine, share: number) => {
    const b = m.get(key) ?? { key, visits: 0, collectedNet: 0, doctorShare: 0, visitKeys: new Set<string>() };
    b.collectedNet += line.net;
    b.doctorShare += share;
    b.visitKeys.add(line.visitKey);
    m.set(key, b);
  };

  for (const line of lines) {
    gross += line.gross;
    net += line.net;
    visits.set(line.visitKey, (visits.get(line.visitKey) ?? 0) + line.net);
    const rule = pickLineRule(line, rules);
    const serviceKey = line.appointmentTypeId ? `type:${line.appointmentTypeId}` : `category:${line.category}`;
    let share = 0;
    if (rule?.ruleType === "FIXED_PER_VISIT") {
      const k = `${rule.id}:${line.visitKey}`;
      const f = fixedVisits.get(k) ?? { net: 0, amount: rule.fixedAmount ?? 0, serviceKey, payerKey: line.payerKey };
      f.net += line.net;
      fixedVisits.set(k, f);
    } else if (rule) {
      share = (line.net * (rule.percent ?? 0)) / 100;
    } else if (rental) {
      share = line.net;
    } else {
      unmatched += line.net;
    }
    shareFromLines += share;
    bump(service, serviceKey, line, share);
    bump(payer, line.payerKey, line, share);
  }
  for (const f of fixedVisits.values()) {
    if (f.net <= 0) continue;
    shareFromLines += f.amount;
    service.get(f.serviceKey)!.doctorShare += f.amount;
    payer.get(f.payerKey)!.doctorShare += f.amount;
  }

  const roomRental = rental ? r2(rental.fixedAmount ?? 0) : 0;
  const doctorShare = r2(shareFromLines - roomRental);
  const adj = r2(adjustments.reduce((s, a) => s + a.amount, 0));
  const paid = r2(payouts.reduce((s, p) => s + p.amount, 0));
  const finish = (m: Map<string, Breakdown & { visitKeys: Set<string> }>): Breakdown[] =>
    [...m.values()].map((b) => ({ key: b.key, visits: b.visitKeys.size, collectedNet: r2(b.collectedNet), doctorShare: r2(b.doctorShare) }));

  return {
    visits: [...visits.values()].filter((v) => v > 0).length,
    collectedGross: r2(gross),
    collectedNet: r2(net),
    doctorShareFromLines: r2(shareFromLines),
    roomRental,
    doctorShare,
    clinicShare: r2(net - doctorShare),
    adjustments: adj,
    payouts: paid,
    netPayable: r2(doctorShare + adj - paid),
    unmatchedNet: r2(unmatched),
    rentalRuleId: rental?.id ?? null,
    byService: finish(service),
    byPayer: finish(payer),
    lineCount: lines.length,
  };
}

/** `YYYY-MM` → [start, end) instants for that calendar month in the clinic time zone. */
export function periodRange(periodKey: string, timeZone: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) throw new Error("periodKey must be YYYY-MM");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error("periodKey must be YYYY-MM");
  return { start: zonedMidnight(y, mo, 1, timeZone), end: zonedMidnight(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, 1, timeZone) };
}

function zonedMidnight(y: number, mo: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  const first = guess - offset;
  const corrected = tzOffsetMs(new Date(first), timeZone);
  return new Date(guess - corrected);
}

function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

export function currentPeriodKey(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}
