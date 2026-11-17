import type { Prisma } from "@prisma/client";

/** Platform + tenant UI entity filter keys (SC-07). */
export const MONEY_AUDIT_ENTITY_KEYS = [
  "subscription",
  "credit",
  "kiorly_invoice",
  "kiorex",
  "entitlement",
  "plan_price",
  "market",
  "settlement",
  "payment",
] as const;

export type MoneyAuditEntityKey = (typeof MONEY_AUDIT_ENTITY_KEYS)[number];

const SUBSCRIPTION: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "subscription." } }, { resource: "Subscription" }],
};

const CREDIT: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "credit." } }, { resource: "CreditWallet" }],
};

const KIORLY_INVOICE: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "kiorly_invoice." } }, { resource: "KiorlyInvoice" }],
};

const KIOREX: Prisma.AuditLogWhereInput = {
  OR: [
    { action: { startsWith: "kiorex." } },
    { resource: { in: ["KiorexCommissionCharge", "KiorexCommissionRate"] } },
  ],
};

const ENTITLEMENT: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "entitlement." } }, { resource: "TenantEntitlementOverride" }],
};

const PLAN_PRICE: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "plan.price." } }, { resource: "PlanPrice" }],
};

const MARKET: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "market." } }, { resource: "Market" }],
};

const SETTLEMENT: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "kiorly.settlement." } }],
};

const PAYMENT: Prisma.AuditLogWhereInput = {
  OR: [{ action: { startsWith: "kiorly_payment." } }, { resource: "KiorlyPayment" }],
};

const ENTITY_WHERE: Record<MoneyAuditEntityKey, Prisma.AuditLogWhereInput> = {
  subscription: SUBSCRIPTION,
  credit: CREDIT,
  kiorly_invoice: KIORLY_INVOICE,
  kiorex: KIOREX,
  entitlement: ENTITLEMENT,
  plan_price: PLAN_PRICE,
  market: MARKET,
  settlement: SETTLEMENT,
  payment: PAYMENT,
};

export function isMoneyAuditEntityKey(raw: string | undefined): raw is MoneyAuditEntityKey {
  return raw != null && (MONEY_AUDIT_ENTITY_KEYS as readonly string[]).includes(raw);
}

/** OR filter across all billing / credits / plan money-audit families. */
export function allMoneyAuditEntityFilter(): Prisma.AuditLogWhereInput {
  return {
    OR: MONEY_AUDIT_ENTITY_KEYS.flatMap((key) => {
      const clause = ENTITY_WHERE[key];
      return clause.OR ?? [clause];
    }),
  };
}

export function moneyAuditWhereForEntity(entity: string | undefined): Prisma.AuditLogWhereInput {
  if (entity && isMoneyAuditEntityKey(entity)) return ENTITY_WHERE[entity];
  return allMoneyAuditEntityFilter();
}