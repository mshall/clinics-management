/**
 * QA-05 operational alert catalog — money + booking paths.
 * Each alert maps to a runbook under Docs/runbooks/.
 */

export const OPERATIONAL_ALERT_IDS = [
  "WHATSAPP_DELIVERY_FAILURE_SPIKE",
  "OUTBOX_PENDING_LAG",
  "SETTLEMENT_JOB_FAILED",
  "KIORLY_PAYMENT_WEBHOOK_FAILED",
  "SIGNUP_FUNNEL_DROP",
  "INTEGRATION_FAILURE_SPIKE",
  "FLAG_SNAPSHOT_STALE",
] as const;

export type OperationalAlertId = (typeof OPERATIONAL_ALERT_IDS)[number];

export type OperationalAlertDefinition = {
  id: OperationalAlertId;
  /** Audit log action or internal signal name */
  auditAction: string;
  dashboardId: OperationalDashboardId;
  runbookDoc: string;
  titleEn: string;
  titleAr: string;
  severity: "critical" | "warning";
};

export const OPERATIONAL_DASHBOARD_IDS = [
  "whatsapp_delivery",
  "outbox_lag",
  "settlement_job",
  "payment_webhooks",
  "signup_funnel",
  "integration_failures",
  "flag_snapshot",
] as const;

export type OperationalDashboardId = (typeof OPERATIONAL_DASHBOARD_IDS)[number];

export type OperationalDashboardPanel = {
  id: OperationalDashboardId;
  titleEn: string;
  titleAr: string;
  alertIds: OperationalAlertId[];
  /** CloudWatch Logs Insights or SQL hint for Grafana/ops */
  queryHint: string;
};

export const OPERATIONAL_ALERTS: OperationalAlertDefinition[] = [
  {
    id: "WHATSAPP_DELIVERY_FAILURE_SPIKE",
    auditAction: "WHATSAPP_DELIVERY_FAILED",
    dashboardId: "whatsapp_delivery",
    runbookDoc: "WHATSAPP_DELIVERY_FAILURE_SPIKE.md",
    titleEn: "WhatsApp delivery failure spike",
    titleAr: "ارتفاع فشل تسليم واتساب",
    severity: "warning",
  },
  {
    id: "OUTBOX_PENDING_LAG",
    auditAction: "OUTBOX_PENDING_LAG",
    dashboardId: "outbox_lag",
    runbookDoc: "OUTBOX_PENDING_LAG.md",
    titleEn: "Transactional outbox lag",
    titleAr: "تأخر صف الأحداث الصادرة",
    severity: "critical",
  },
  {
    id: "SETTLEMENT_JOB_FAILED",
    auditAction: "SETTLEMENT_JOB_FAILED",
    dashboardId: "settlement_job",
    runbookDoc: "SETTLEMENT_JOB_FAILED.md",
    titleEn: "Monthly settlement job failed",
    titleAr: "فشل مهمة التسوية الشهرية",
    severity: "critical",
  },
  {
    id: "KIORLY_PAYMENT_WEBHOOK_FAILED",
    auditAction: "KIORLY_PAYMENT_WEBHOOK_FAILED",
    dashboardId: "payment_webhooks",
    runbookDoc: "KIORLY_PAYMENT_WEBHOOK.md",
    titleEn: "Kiorly SaaS payment webhook failure",
    titleAr: "فشل webhook مدفوعات كيورلي",
    severity: "critical",
  },
  {
    id: "SIGNUP_FUNNEL_DROP",
    auditAction: "SIGNUP_FUNNEL_DROP",
    dashboardId: "signup_funnel",
    runbookDoc: "SIGNUP_FUNNEL_DROP.md",
    titleEn: "Public signup completion rate dropped",
    titleAr: "انخفاض معدل إكمال التسجيل العام",
    severity: "warning",
  },
  {
    id: "INTEGRATION_FAILURE_SPIKE",
    auditAction: "INTEGRATION_FAILURE_SPIKE",
    dashboardId: "integration_failures",
    runbookDoc: "INTEGRATION_FAILURE_SPIKE.md",
    titleEn: "Integration / booking API failure spike",
    titleAr: "ارتفاع فشل تكامل الحجز / API",
    severity: "warning",
  },
  {
    id: "FLAG_SNAPSHOT_STALE",
    auditAction: "FLAG_SNAPSHOT_STALE",
    dashboardId: "flag_snapshot",
    runbookDoc: "FLAG_SNAPSHOT_STALE.md",
    titleEn: "Kiorex feature-flag snapshot is stale (> 10 min)",
    titleAr: "لقطة أعلام الميزات من كيوريكس قديمة (أكثر من 10 دقائق)",
    severity: "warning",
  },
];

export const OPERATIONAL_DASHBOARDS: OperationalDashboardPanel[] = [
  {
    id: "whatsapp_delivery",
    titleEn: "WhatsApp delivery",
    titleAr: "تسليم واتساب",
    alertIds: ["WHATSAPP_DELIVERY_FAILURE_SPIKE"],
    queryHint: "OutboundMessage `status=FAILED` last 1h; audit `WHATSAPP_DELIVERY_FAILED`",
  },
  {
    id: "outbox_lag",
    titleEn: "Outbox lag",
    titleAr: "تأخر الصندوق الصادر",
    alertIds: ["OUTBOX_PENDING_LAG"],
    queryHint: "OutboxEvent `status=PENDING` min(createdAt); log `Outbox lag alert`",
  },
  {
    id: "settlement_job",
    titleEn: "Settlement job",
    titleAr: "مهمة التسوية",
    alertIds: ["SETTLEMENT_JOB_FAILED"],
    queryHint: "SettlementScheduler logs; audit `SETTLEMENT_JOB_FAILED`; platform settlement batch",
  },
  {
    id: "payment_webhooks",
    titleEn: "Payment webhooks",
    titleAr: "webhooks المدفوعات",
    alertIds: ["KIORLY_PAYMENT_WEBHOOK_FAILED"],
    queryHint: "KiorlyPayment `status=FAILED`; audit `KIORLY_PAYMENT_WEBHOOK_FAILED`",
  },
  {
    id: "signup_funnel",
    titleEn: "Signup funnel",
    titleAr: "قمع التسجيل",
    alertIds: ["SIGNUP_FUNNEL_DROP"],
    queryHint: "OtpChallenge verified SIGNUP vs audit `SIGNUP_COMPLETED` last 24h",
  },
  {
    id: "integration_failures",
    titleEn: "Integration failures",
    titleAr: "فشل التكامل",
    alertIds: ["INTEGRATION_FAILURE_SPIKE"],
    queryHint: "IntegrationFailureLog count last 1h; Governance → Failing operations",
  },
  {
    id: "flag_snapshot",
    titleEn: "Flag snapshot freshness",
    titleAr: "حداثة لقطة الأعلام",
    alertIds: ["FLAG_SNAPSHOT_STALE"],
    queryHint: "KiorexFlagSnapshot.fetchedAt age; log `FLAG_SNAPSHOT_STALE`; GET /admin/platform/feature-flags (snapshot.ageSeconds)",
  },
];

export function alertById(id: OperationalAlertId): OperationalAlertDefinition {
  const row = OPERATIONAL_ALERTS.find((a) => a.id === id);
  if (!row) throw new Error(`Unknown alert ${id}`);
  return row;
}