/**
 * SC-07: every money-affecting service entrypoint listed here must write an AuditLog
 * with the given action inside the same method body.
 */
export type MoneyAuditCoverageEntry = {
  /** Path under apps/api/src */
  file: string;
  method: string;
  action: string;
  /** When audit is written via another service in the same call chain */
  delegatedAudit?: boolean;
};

export const MONEY_AUDIT_COVERAGE: MoneyAuditCoverageEntry[] = [
  { file: "subscriptions/subscription.service.ts", method: "appendEvent", action: "subscription." },
  { file: "subscriptions/subscription.service.ts", method: "recordTrialEndingNotice", action: "subscription.trial_ending_notice" },
  { file: "subscriptions/dunning.service.ts", method: "maybeSendReminders", action: "subscription.dunning_reminder" },
  {
    file: "subscriptions/trial-engine.service.ts",
    method: "extendTrial",
    action: "subscription.trial_extended",
    delegatedAudit: true,
  },
  // Public wrappers retry/transaction-wrap; audit writes live in the InTx helpers.
  { file: "credits/credit-wallet.service.ts", method: "grantInTx", action: "credit.grant" },
  { file: "credits/credit-wallet.service.ts", method: "consumeInTx", action: "credit.consume" },
  { file: "billing-platform/kiorly-invoices.service.ts", method: "issue", action: "kiorly_invoice.issued" },
  { file: "billing-platform/kiorly-invoices.service.ts", method: "voidViaCreditInvoice", action: "kiorly_invoice.voided" },
  { file: "billing-platform/kiorly-payment.service.ts", method: "verifyManualPayment", action: "kiorly_payment.verified" },
  { file: "billing-platform/settlement.service.ts", method: "settlePeriod", action: "kiorly.settlement." },
  { file: "kiorex/commission-dispute.service.ts", method: "openDispute", action: "kiorex.commission_dispute.opened" },
  { file: "kiorex/commission-dispute.service.ts", method: "resolve", action: "kiorex.commission_dispute.resolved" },
  { file: "kiorex/commission-charge.service.ts", method: "onApprovedDispute", action: "kiorex.commission_charge.dispute_approved" },
  { file: "kiorex/kiorex-commission.service.ts", method: "create", action: "kiorex.rate.created" },
  { file: "kiorex/kiorex-commission.service.ts", method: "patch", action: "kiorex.rate.updated" },
  { file: "kiorex/kiorex-commission.service.ts", method: "remove", action: "kiorex.rate.removed" },
  { file: "kiorex/kiorex-commission.service.ts", method: "patchMarketSettings", action: "kiorex.market_settings.updated" },
  { file: "plans/plans.service.ts", method: "createPlanPriceAs", action: "plan.price.published" },
  { file: "admin/platform-admin.service.ts", method: "putTenantEntitlementOverride", action: "entitlement.override_set" },
  { file: "markets/commercial-config.service.ts", method: "update", action: "market.commercial_config_updated" },
];