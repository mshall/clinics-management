import type { Prisma } from "@prisma/client";

/** KX-08: review-count-weighted average of synced Kiorex doctor ratings (null when there are no reviews). */
export function weightedKiorexRating(rows: { averageRating: Prisma.Decimal | number; reviewCount: number }[]): {
  averageRating: number | null;
  reviewCount: number;
} {
  const reviewCount = rows.reduce((s, r) => s + r.reviewCount, 0);
  if (!reviewCount) return { averageRating: null, reviewCount: 0 };
  const sum = rows.reduce((s, r) => s + Number(r.averageRating) * r.reviewCount, 0);
  return { averageRating: Math.round((sum / reviewCount) * 100) / 100, reviewCount };
}
