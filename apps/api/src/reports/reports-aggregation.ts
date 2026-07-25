import {
  EncounterStatus,
  ExpenseStatus,
  Prisma,
  RevenueStatus,
  UserRole,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import type { PrismaService } from "../prisma/prisma.service";

export type ReportsCurrencyTotals = {
  currency: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  encounterRevenue: number;
  operationRevenue: number;
  otherRevenue: number;
  otherBreakdown: { category: string; amount: number }[];
};

export function mergeCurrencyTotals(
  revenueByCurrency: Map<string, number>,
  expensesByCurrency: Map<string, number>,
  encounterRevenueByCurrency: Map<string, number> = new Map(),
  operationRevenueByCurrency: Map<string, number> = new Map(),
  otherRevenueByCurrency: Map<string, number> = new Map(),
  otherBreakdownByCurrency: Map<string, { category: string; amount: number }[]> = new Map(),
): ReportsCurrencyTotals[] {
  const currencies = new Set([
    ...revenueByCurrency.keys(),
    ...expensesByCurrency.keys(),
    ...encounterRevenueByCurrency.keys(),
    ...operationRevenueByCurrency.keys(),
    ...otherRevenueByCurrency.keys(),
    ...otherBreakdownByCurrency.keys(),
  ]);
  return [...currencies]
    .sort((a, b) => a.localeCompare(b))
    .map((currency) => {
      const revenue = revenueByCurrency.get(currency) ?? 0;
      const expenses = expensesByCurrency.get(currency) ?? 0;
      return {
        currency,
        revenue,
        expenses,
        netProfit: revenue - expenses,
        encounterRevenue: encounterRevenueByCurrency.get(currency) ?? 0,
        operationRevenue: operationRevenueByCurrency.get(currency) ?? 0,
        otherRevenue: otherRevenueByCurrency.get(currency) ?? 0,
        otherBreakdown: otherBreakdownByCurrency.get(currency) ?? [],
      };
    });
}

export function buildReportsRevenueWhere(
  tenantId: string,
  start: Date,
  end: Date,
  viewer: JwtUser | undefined,
  clinicId?: string | null,
  scopeClinicIds?: string[] | null,
): Prisma.RevenueEntryWhereInput {
  const where: Prisma.RevenueEntryWhereInput = {
    tenantId,
    status: RevenueStatus.POSTED,
    postedAt: { gte: start, lte: end },
  };

  if (clinicId?.trim()) {
    where.clinicId = clinicId.trim();
  } else if (scopeClinicIds?.length) {
    where.clinicId = { in: scopeClinicIds };
  }

  if (viewer?.role === UserRole.PHYSICIAN) {
    where.encounterId = { not: null };
    where.encounter = { is: { clinicianId: viewer.userId } };
  }

  return where;
}

export function buildReportsExpenseWhere(
  tenantId: string,
  start: Date,
  end: Date,
  clinicId?: string | null,
  scopeClinicIds?: string[] | null,
): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {
    tenantId,
    status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PENDING] },
    incurredAt: { gte: start, lte: end },
  };

  if (clinicId?.trim()) {
    where.clinicId = clinicId.trim();
  } else if (scopeClinicIds?.length) {
    where.clinicId = { in: scopeClinicIds };
  }

  return where;
}

export function buildReportsEncounterWhere(
  tenantId: string,
  start: Date,
  end: Date,
  viewer: JwtUser | undefined,
  clinicId?: string | null,
  scopeClinicIds?: string[] | null,
): Prisma.EncounterWhereInput {
  const where: Prisma.EncounterWhereInput = {
    tenantId,
    status: { in: [EncounterStatus.FINALIZED, EncounterStatus.AMENDED] },
    finalizedAt: { gte: start, lte: end },
  };

  if (clinicId?.trim()) {
    where.clinicId = clinicId.trim();
  } else if (scopeClinicIds?.length) {
    where.clinicId = { in: scopeClinicIds };
  }

  if (viewer?.role === UserRole.PHYSICIAN) {
    where.clinicianId = viewer.userId;
  }

  return where;
}

export async function sumRevenueByCurrency(
  prisma: PrismaService,
  where: Prisma.RevenueEntryWhereInput,
): Promise<Map<string, number>> {
  const grouped = await prisma.revenueEntry.groupBy({
    by: ["currency"],
    where,
    _sum: { netAmount: true },
  });
  const map = new Map<string, number>();
  for (const row of grouped) {
    map.set(row.currency, Number(row._sum.netAmount ?? 0));
  }
  return map;
}

export async function sumExpensesByCurrency(
  prisma: PrismaService,
  where: Prisma.ExpenseWhereInput,
): Promise<Map<string, number>> {
  const grouped = await prisma.expense.groupBy({
    by: ["currency"],
    where,
    _sum: { amount: true },
  });
  const map = new Map<string, number>();
  for (const row of grouped) {
    map.set(row.currency, Number(row._sum.amount ?? 0));
  }
  return map;
}
