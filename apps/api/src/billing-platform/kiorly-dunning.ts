export function isKiorlyDunningPaused(
  sub: { kiorlyDunningPausedUntil: Date | null },
  now: Date = new Date(),
): boolean {
  return sub.kiorlyDunningPausedUntil != null && sub.kiorlyDunningPausedUntil > now;
}

export const KIORLY_AUTO_CHARGE_RETRY_DAYS = [1, 3, 7] as const;