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

/** Monday-based calendar grid cells (null = padding outside month). */
export function buildMonthGrid(year: number, monthIndex: number): (Date | null)[] {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const startPad = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(year, monthIndex, day, 12, 0, 0, 0));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameLocalDateIso(iso: string, day: Date): boolean {
  return iso === toLocalDateIso(day);
}

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
