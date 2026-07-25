/** ISO date `YYYY-MM-DD` in local timezone. */
export function toLocalDateIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseLocalDateIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

export function monthBounds(year: number, monthIndex: number): { from: string; to: string } {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  return { from: toLocalDateIso(first), to: toLocalDateIso(last) };
}

export type CalendarDayCell = {
  date: Date;
  iso: string;
  inCurrentMonth: boolean;
};

function gridStartDate(year: number, monthIndex: number): Date {
  const first = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  const startPad = (first.getDay() + 6) % 7;
  return new Date(year, monthIndex, 1 - startPad, 12, 0, 0, 0);
}

/** Visible Monday-based month grid (6 weeks), including adjacent-month days like Apple Calendar. */
export function buildMonthGrid(year: number, monthIndex: number): CalendarDayCell[] {
  const start = gridStartDate(year, monthIndex);
  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      date,
      iso: toLocalDateIso(date),
      inCurrentMonth: date.getMonth() === monthIndex,
    });
  }
  return cells;
}

/** Fetch range covering every day rendered in the month grid. */
export function visibleGridBounds(year: number, monthIndex: number): { from: string; to: string } {
  const start = gridStartDate(year, monthIndex);
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  return { from: toLocalDateIso(start), to: toLocalDateIso(end) };
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameLocalDateIso(iso: string, day: Date): boolean {
  return iso === toLocalDateIso(day);
}

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
