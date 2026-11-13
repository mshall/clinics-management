import { formatLocalYmd, resolveLedgerListingRange, resolveReportingRange } from "../common/reporting-range";

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function parseCalendarMonthInMessage(m: string): { start: Date; end: Date; labelEn: string; labelAr: string } | null {
  const match = m.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b(?:\s+(\d{4}))?/,
  );
  if (!match) return null;
  const monthIndex = MONTH_NAMES[match[1]!];
  if (monthIndex === undefined) return null;
  const year = match[2] ? Number.parseInt(match[2], 10) : new Date().getFullYear();
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const label = `${match[1]} ${year}`;
  return { start, end, labelEn: label, labelAr: label };
}

export type AssistantPeriod = {
  start: Date;
  end: Date;
  labelEn: string;
  labelAr: string;
};

/** Parse common period phrases; default = current calendar month. */
export function resolveAssistantPeriod(message: string): AssistantPeriod {
  const m = message.toLowerCase();
  let from: string | undefined;
  let to: string | undefined;
  let labelEn = "current calendar month";
  let labelAr = "الشهر التقويمي الحالي";

  const monthRange = parseCalendarMonthInMessage(m);
  if (monthRange) {
    from = formatLocalYmd(monthRange.start);
    to = formatLocalYmd(monthRange.end);
    labelEn = monthRange.labelEn;
    labelAr = monthRange.labelAr;
  } else if (/this month|current month|هذا الشهر|الشهر الحالي|per month/.test(m)) {
    from = undefined;
    to = undefined;
  } else if (/last month|previous month|الشهر الماضي/.test(m)) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    from = formatLocalYmd(start);
    to = formatLocalYmd(end);
    labelEn = `${from} → ${to}`;
    labelAr = `${from} → ${to}`;
  } else if (/this year|السنة الحالية/.test(m)) {
    const now = new Date();
    from = formatLocalYmd(new Date(now.getFullYear(), 0, 1));
    to = formatLocalYmd(new Date(now.getFullYear(), 11, 31));
    labelEn = `year to date (${from} → ${to})`;
    labelAr = `من بداية السنة (${from} → ${to})`;
  } else if (/\b\d{4}-\d{2}-\d{2}\b.*\b(to|through|-|until)\b.*\b\d{4}-\d{2}-\d{2}\b/i.test(m)) {
    const dates = m.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
    if (dates && dates.length >= 2) {
      from = dates[0];
      to = dates[1];
      labelEn = `${from} → ${to}`;
      labelAr = labelEn;
    }
  } else {
    const range = resolveReportingRange(undefined, undefined);
    return {
      start: range.start,
      end: range.end,
      labelEn,
      labelAr,
    };
  }

  const { start, end } = resolveLedgerListingRange(from, to);
  if (from && to) {
    return { start, end, labelEn, labelAr };
  }
  return {
    start,
    end,
    labelEn,
    labelAr,
  };
}
