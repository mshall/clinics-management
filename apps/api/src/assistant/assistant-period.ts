import { formatLocalYmd, resolveLedgerListingRange, resolveReportingRange } from "../common/reporting-range";

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

  if (/this month|current month|هذا الشهر|الشهر الحالي/.test(m)) {
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
