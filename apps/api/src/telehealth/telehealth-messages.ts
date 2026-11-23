/** Pure message bodies for telehealth notifications (AR/EN). {{link}} is the patient join URL; times are pre-formatted in the clinic timezone. */
export type TelehealthMessageKind = "link" | "moved" | "r24" | "r15";
export const TELEHEALTH_TEMPLATE_KEY: Record<TelehealthMessageKind, string> = {
  link: "telehealth_link",
  moved: "telehealth_moved",
  r24: "telehealth_reminder_24h",
  r15: "telehealth_reminder_15m",
};

export function telehealthMessageBody(kind: TelehealthMessageKind, lang: "en" | "ar", v: { name: string; clinic: string; doctor: string; time: string; link: string }): string {
  const en = {
    link: `Hello ${v.name}, your video visit with ${v.doctor} at ${v.clinic} is on ${v.time}. Join here: ${v.link}`,
    moved: `Hello ${v.name}, your video visit with ${v.doctor} at ${v.clinic} was moved to ${v.time}. Same link: ${v.link}`,
    r24: `Reminder: your video visit with ${v.doctor} is tomorrow, ${v.time}. Join here: ${v.link}`,
    r15: `Your video visit with ${v.doctor} starts in 15 minutes (${v.time}). Join here: ${v.link}`,
  };
  const ar = {
    link: `مرحباً ${v.name}، زيارتك بالفيديو مع ${v.doctor} في ${v.clinic} يوم ${v.time}. للانضمام: ${v.link}`,
    moved: `مرحباً ${v.name}، تم نقل زيارتك بالفيديو مع ${v.doctor} في ${v.clinic} إلى ${v.time}. نفس الرابط: ${v.link}`,
    r24: `تذكير: زيارتك بالفيديو مع ${v.doctor} غداً ${v.time}. للانضمام: ${v.link}`,
    r15: `زيارتك بالفيديو مع ${v.doctor} تبدأ بعد 15 دقيقة (${v.time}). للانضمام: ${v.link}`,
  };
  return (lang === "ar" ? ar : en)[kind];
}

/** What is due for a session, given what was already sent. Pure (unit-tested): dedupe per linkVersion; a moved start re-arms reminders. */
export type ReminderState = {
  firstStartsAt?: string;
  notified?: { linkVersion: number; startsAt: string };
  reminders?: Partial<Record<"24h" | "15m", { startsAt: string; linkVersion: number }>>;
};

export function dueNotifications(
  now: Date,
  s: { linkVersion: number; startsAt: Date; state: ReminderState },
): { kinds: TelehealthMessageKind[]; next: ReminderState } {
  const kinds: TelehealthMessageKind[] = [];
  const next: ReminderState = { ...s.state, reminders: { ...(s.state.reminders ?? {}) } };
  const startIso = s.startsAt.toISOString();
  if (!next.firstStartsAt) next.firstStartsAt = startIso;
  const n = s.state.notified;
  if (!n || n.linkVersion !== s.linkVersion) {
    kinds.push("link"); // creation or "Regenerate link": the new link is (re-)sent
  } else if (n.startsAt !== startIso) {
    kinds.push("moved"); // time edit: same link, patient told "moved to ..."
  }
  if (kinds.length) next.notified = { linkVersion: s.linkVersion, startsAt: startIso };
  const msToStart = s.startsAt.getTime() - now.getTime();
  const sent = (k: "24h" | "15m") => {
    const r = s.state.reminders?.[k];
    return r != null && r.startsAt === startIso && r.linkVersion === s.linkVersion;
  };
  // 24 h reminder: only when the visit is still >= 23 h away at the 24 h mark window (skip when booked/moved inside 24 h: the link/moved message covers it)
  if (msToStart <= 24 * 3600_000 && msToStart > 21 * 3600_000 && !sent("24h") && !kinds.includes("link") && !kinds.includes("moved")) {
    kinds.push("r24");
    next.reminders!["24h"] = { startsAt: startIso, linkVersion: s.linkVersion };
  } else if (msToStart <= 24 * 3600_000 && !sent("24h")) {
    next.reminders!["24h"] = { startsAt: startIso, linkVersion: s.linkVersion }; // inside 24 h already: never send a stale 24 h reminder
  }
  if (msToStart <= 15 * 60_000 && msToStart > 5 * 60_000 && !sent("15m") && !kinds.includes("moved")) {
    kinds.push("r15");
    next.reminders!["15m"] = { startsAt: startIso, linkVersion: s.linkVersion };
  } else if (msToStart <= 15 * 60_000 && !sent("15m")) {
    next.reminders!["15m"] = { startsAt: startIso, linkVersion: s.linkVersion };
  }
  return { kinds, next };
}

/** RFC 5545 calendar file for the optional .ics download. Times are UTC. */
export function buildIcs(i: { uid: string; startsAt: Date; endsAt: Date; summary: string; link: string; now?: Date }): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (t: string) => t.replace(/[\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kiorly//Telehealth//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${i.uid}@kiorly`, `DTSTAMP:${f(i.now ?? new Date())}`, `DTSTART:${f(i.startsAt)}`, `DTEND:${f(i.endsAt)}`,
    `SUMMARY:${esc(i.summary)}`, `DESCRIPTION:${esc(`Join: ${i.link}`)}`, `URL:${i.link}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
}
