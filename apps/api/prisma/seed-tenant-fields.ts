import { Locale } from "@prisma/client";

export const DEFAULT_SEED_DEPLOYMENT_CELL = "frankfurt";

export type MarketHostRef = { id: string; hostCell: string };

export type ShellTenantSeedRow = {
  name: string;
  nameAr: string;
  baseCurrency: string;
  defaultLocale: Locale;
  marketId: string | null;
  deploymentCell: string;
};

/**
 * Fresh-db bulk tenant rows (indexes 0..14). Index 1 mirrors Dr Ahmed EG market binding.
 * Exported for unit tests — CI fails if deploymentCell is omitted from Prisma create data.
 */
export function shellTenantSeedRow(
  i: number,
  names: { kiorly: string; drAhmed: string },
  egMarket: MarketHostRef | null,
): ShellTenantSeedRow {
  const cell = egMarket?.hostCell ?? DEFAULT_SEED_DEPLOYMENT_CELL;
  const isKiorly = i === 0;
  const isDrAhmedLabel = i === 1;
  return {
    name: isKiorly ? names.kiorly : isDrAhmedLabel ? names.drAhmed : `Shell Organization ${i + 1}`,
    nameAr: isKiorly
      ? "مجموعة كيورلي للعيادات (تجريبي)"
      : isDrAhmedLabel
        ? "مجموعة د. أحمد الشال — استشاري علاج الآلام المزمنة والمفاصل والعمود الفقري"
        : `منظمة ${i + 1}`,
    baseCurrency: i === 1 ? "EGP" : "AED",
    defaultLocale: i === 1 ? Locale.ar : Locale.en,
    marketId: i === 1 ? egMarket?.id ?? null : null,
    deploymentCell: i === 1 ? cell : DEFAULT_SEED_DEPLOYMENT_CELL,
  };
}