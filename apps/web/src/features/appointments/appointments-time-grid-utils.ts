import type { AppointmentDto } from "@/lib/api-types";
import { effectiveAppointmentEnd } from "@/lib/appointment-scheduling";

/** Greedy column packing so overlapping visits sit side by side (like a real clinic schedule). */
export function placeDay(list: AppointmentDto[]): Placed[] {
  const items = list
    .map((a) => ({ a, start: new Date(a.startsAt), end: effectiveAppointmentEnd(a) }))
    .sort((x, y) => x.start.getTime() - y.start.getTime() || x.end.getTime() - y.end.getTime());
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    for (const p of cluster) p.cols = cols;
    out.push(...cluster);
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.start.getTime() >= clusterEnd) flush();
    const used = new Set(cluster.filter((p) => p.end > it.start).map((p) => p.col));
    let col = 0;
    while (used.has(col)) col += 1;
    cluster.push({ ...it, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, it.end.getTime());
  }
  if (cluster.length) flush();
  return out;
}

export type Placed = { a: AppointmentDto; start: Date; end: Date; col: number; cols: number };
