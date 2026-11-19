/**
 * GT-04 — first-response SLA for Kiorly support.
 * Default market hours: Sun–Thu 09:00–18:00 in the market timezone (EG: Africa/Cairo).
 * P1 (URGENT) target: 4 business hours.
 */

export type SupportSlaConfig = {
  timezone: string;
  /** JS getUTCDay() style after converting to local: 0=Sun … 6=Sat. Weekend = not working. */
  weekendDays: number[];
  openHour: number;
  closeHour: number;
  /** Business hours allowed before first response by priority. */
  firstResponseHoursByPriority: Record<string, number>;
};

export const DEFAULT_SUPPORT_SLA: SupportSlaConfig = {
  timezone: "Africa/Cairo",
  /** Fri+Sat weekend (Egypt). Working Sun–Thu. */
  weekendDays: [5, 6],
  openHour: 9,
  closeHour: 18,
  firstResponseHoursByPriority: {
    URGENT: 4,
    HIGH: 8,
    MEDIUM: 16,
    LOW: 24,
  },
};

/** Parts of a Date in an IANA timezone. */
export function zonedParts(
  at: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

function zonedInstant(timeZone: string, y: number, m: number, d: number, h: number, min = 0): Date {
  const utcGuess = Date.UTC(y, m - 1, d, h, min, 0);
  const asLocal = zonedParts(new Date(utcGuess), timeZone);
  const desiredAsMinutes = h * 60 + min;
  const actualAsMinutes = asLocal.hour * 60 + asLocal.minute;
  const deltaMin = desiredAsMinutes - actualAsMinutes;
  // Also correct day drift when offset push crosses midnight
  let dayDelta = 0;
  if (asLocal.year !== y || asLocal.month !== m || asLocal.day !== d) {
    const want = Date.UTC(y, m - 1, d);
    const got = Date.UTC(asLocal.year, asLocal.month - 1, asLocal.day);
    dayDelta = Math.round((want - got) / 86_400_000);
  }
  return new Date(utcGuess + deltaMin * 60_000 + dayDelta * 86_400_000);
}

function addCalendarDay(y: number, m: number, d: number, n: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function isWorkingDay(weekday: number, weekendDays: number[]): boolean {
  return !weekendDays.includes(weekday);
}

/** Advance `from` by `businessHours` within support open hours. */
export function addBusinessHours(from: Date, businessHours: number, cfg: SupportSlaConfig = DEFAULT_SUPPORT_SLA): Date {
  let remainingMinutes = Math.max(0, businessHours) * 60;
  let cursor = new Date(from);
  // Cap iterations so bad configs cannot loop forever.
  for (let guard = 0; guard < 10_000 && remainingMinutes > 0; guard++) {
    const p = zonedParts(cursor, cfg.timezone);
    if (!isWorkingDay(p.weekday, cfg.weekendDays)) {
      const next = addCalendarDay(p.year, p.month, p.day, 1);
      cursor = zonedInstant(cfg.timezone, next.y, next.m, next.d, cfg.openHour, 0);
      continue;
    }
    const open = zonedInstant(cfg.timezone, p.year, p.month, p.day, cfg.openHour, 0);
    const close = zonedInstant(cfg.timezone, p.year, p.month, p.day, cfg.closeHour, 0);
    if (cursor < open) {
      cursor = open;
      continue;
    }
    if (cursor >= close) {
      const next = addCalendarDay(p.year, p.month, p.day, 1);
      cursor = zonedInstant(cfg.timezone, next.y, next.m, next.d, cfg.openHour, 0);
      continue;
    }
    const usable = Math.min(remainingMinutes, Math.floor((close.getTime() - cursor.getTime()) / 60_000));
    cursor = new Date(cursor.getTime() + usable * 60_000);
    remainingMinutes -= usable;
    if (remainingMinutes > 0 && cursor >= close) {
      const next = addCalendarDay(p.year, p.month, p.day, 1);
      cursor = zonedInstant(cfg.timezone, next.y, next.m, next.d, cfg.openHour, 0);
    }
  }
  return cursor;
}

export function firstResponseHoursForPriority(priority: string, cfg: SupportSlaConfig = DEFAULT_SUPPORT_SLA): number {
  return cfg.firstResponseHoursByPriority[priority] ?? cfg.firstResponseHoursByPriority.MEDIUM;
}

export function computeFirstResponseDueAt(
  createdAt: Date,
  priority: string,
  cfg: SupportSlaConfig = DEFAULT_SUPPORT_SLA,
): Date {
  return addBusinessHours(createdAt, firstResponseHoursForPriority(priority, cfg), cfg);
}

export function measureFirstResponseSla(input: {
  createdAt: Date;
  priority: string;
  firstRespondedAt: Date | null;
  now?: Date;
  cfg?: SupportSlaConfig;
}): {
  dueAt: Date;
  respondedAt: Date | null;
  breached: boolean;
  responseMinutes: number | null;
  targetHours: number;
} {
  const cfg = input.cfg ?? DEFAULT_SUPPORT_SLA;
  const dueAt = computeFirstResponseDueAt(input.createdAt, input.priority, cfg);
  const now = input.now ?? new Date();
  const respondedAt = input.firstRespondedAt;
  const targetHours = firstResponseHoursForPriority(input.priority, cfg);
  if (respondedAt) {
    return {
      dueAt,
      respondedAt,
      breached: respondedAt.getTime() > dueAt.getTime(),
      responseMinutes: Math.round((respondedAt.getTime() - input.createdAt.getTime()) / 60_000),
      targetHours,
    };
  }
  return {
    dueAt,
    respondedAt: null,
    breached: now.getTime() > dueAt.getTime(),
    responseMinutes: null,
    targetHours,
  };
}

export const SUPPORT_MACROS = [
  {
    id: "ack_investigating",
    titleEn: "Acknowledged — investigating",
    titleAr: "تم الاستلام — جارٍ التحقق",
    bodyEn: "Thanks for contacting Kiorly support. We have received your request and are investigating. We will update you shortly.",
    bodyAr: "شكرًا لتواصلك مع دعم كيورلي. استلمنا طلبك ونتحقق منه الآن وسنوافيك بالتحديث قريبًا.",
  },
  {
    id: "need_more_info",
    titleEn: "Need more information",
    titleAr: "نحتاج معلومات إضافية",
    bodyEn: "To continue, please share: clinic name, approximate time of the issue, and a screenshot if possible.",
    bodyAr: "للمتابعة، يرجى مشاركة: اسم العيادة، وقت تقريبي للمشكلة، ولقطة شاشة إن أمكن.",
  },
  {
    id: "resolved_steps",
    titleEn: "Resolved — steps taken",
    titleAr: "تم الحل — الخطوات",
    bodyEn: "This should now be fixed. Please retry the same action and reply if anything still fails.",
    bodyAr: "يفترض أن المشكلة حُلّت. أعد المحاولة وإذا استمرت أخبرنا.",
  },
  {
    id: "escalate_engineering",
    titleEn: "Escalated to engineering",
    titleAr: "تم التصعيد للهندسة",
    bodyEn: "We have escalated this to engineering. You will get an update once we have a fix or workaround.",
    bodyAr: "صعّدنا الطلب لفريق الهندسة. سنوافيك عند توفر إصلاح أو حل بديل.",
  },
] as const;

export type SupportMacroId = (typeof SUPPORT_MACROS)[number]["id"];

export function supportMacroById(id: string) {
  return SUPPORT_MACROS.find((m) => m.id === id) ?? null;
}
