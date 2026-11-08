/** Default lookback when listing audit logs without an explicit range (keeps count/findMany index-friendly). */
export const DEFAULT_AUDIT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export const MAX_AUDIT_LOOKBACK_MS = 366 * 24 * 60 * 60 * 1000;

export function resolveAuditLogCreatedAtFilter(from?: string, to?: string): { gte?: Date; lte?: Date } {
  const filter: { gte?: Date; lte?: Date } = {};
  const now = new Date();
  if (to?.trim()) {
    const t = new Date(to);
    if (!Number.isNaN(t.getTime())) filter.lte = t;
  }
  if (from?.trim()) {
    const f = new Date(from);
    if (!Number.isNaN(f.getTime())) filter.gte = f;
  }
  if (!filter.gte && !filter.lte) {
    filter.gte = new Date(now.getTime() - DEFAULT_AUDIT_LOOKBACK_MS);
    return filter;
  }
  const lte = filter.lte ?? now;
  const gte = filter.gte ?? new Date(lte.getTime() - DEFAULT_AUDIT_LOOKBACK_MS);
  let span = lte.getTime() - gte.getTime();
  if (span > MAX_AUDIT_LOOKBACK_MS) {
    filter.gte = new Date(lte.getTime() - MAX_AUDIT_LOOKBACK_MS);
    filter.lte = lte;
    return filter;
  }
  if (span < 0) {
    filter.gte = lte;
    filter.lte = gte;
    span = filter.lte.getTime() - filter.gte.getTime();
    if (span > MAX_AUDIT_LOOKBACK_MS) {
      filter.gte = new Date(filter.lte.getTime() - MAX_AUDIT_LOOKBACK_MS);
    }
    return filter;
  }
  filter.gte = gte;
  filter.lte = lte;
  return filter;
}
