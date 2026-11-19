import { z } from "zod";

const trialCommissionPolicy = z.enum([
  "WAIVE_ALL",
  "WAIVE_UP_TO_PLAN_PRICE",
  "CHARGE",
  "waived",
  "standard",
]);

const trialSchema = z.object({
  standardDays: z.number().int().min(1).max(730),
  foundingDays: z.number().int().min(1).max(730),
  activation: z.object({
    minVisits: z.number().int().min(1).max(10_000),
    withinDays: z.number().int().min(1).max(365),
  }),
  commissionPolicy: trialCommissionPolicy,
  cohorts: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(64),
        trialDays: z.number().int().min(1).max(730),
      }),
    )
    .max(50)
    .optional(),
});

/** KX-06 — patient-initiated change windows on Kiorex bookings (hours before start). */
export const kiorexCancellationPolicySchema = z.object({
  patientCancelMinHours: z.number().int().min(0).max(168),
  patientRescheduleMinHours: z.number().int().min(0).max(168),
  depositRefundMinHours: z.number().int().min(0).max(336),
  maxPatientReschedules: z.number().int().min(0).max(10),
});

export type KiorexCancellationPolicy = z.infer<typeof kiorexCancellationPolicySchema>;

export const KIOREX_CANCELLATION_POLICY_DEFAULTS: KiorexCancellationPolicy = {
  patientCancelMinHours: 12,
  patientRescheduleMinHours: 12,
  depositRefundMinHours: 24,
  maxPatientReschedules: 2,
};

const kiorexSchema = z.object({
  newPatientLookbackMonths: z.number().int().min(1).max(120),
  disputeWindowDays: z.number().int().min(1).max(90),
  benchmarkTargetRatio: z.number().min(0.05).max(1.5),
  autoConfirmHours: z.number().int().min(1).max(168),
  cancellationPolicy: kiorexCancellationPolicySchema.optional(),
});

const liteSchema = z.object({
  commissionMonthlyCap: z.number().min(0).nullable(),
  minInvoice: z.number().min(0).max(1_000_000),
});

const dunningSchema = z.object({
  graceDays: z.number().int().min(1).max(90),
  readOnlyAfterDays: z.number().int().min(2).max(180),
  suspendAfterDays: z.number().int().min(3).max(365),
});

const referralSchema = z.object({
  rewardMonths: z.number().int().min(0).max(24),
  expiryMonths: z.number().int().min(1).max(60),
  maxPerYear: z.number().int().min(0).max(100),
});

/** ON-07 — field-sales rep commission; optional so existing packs stay valid. */
const salesRepSchema = z.object({
  commissionPercent: z.number().min(0).max(100),
  retentionDays: z.number().int().min(0).max(730),
});

/** FS-04 — when a booking needs a deposit and how the payment link behaves; optional so existing packs stay valid. */
export const depositPolicySchema = z.object({
  noShowThreshold: z.number().int().min(1).max(50),
  riskScoreThreshold: z.number().int().min(1).max(100),
  defaultPercentOfFee: z.number().min(1).max(100),
  linkExpiryHours: z.number().int().min(1).max(168),
  autoCancelUnpaid: z.boolean(),
});

export type DepositPolicy = z.infer<typeof depositPolicySchema>;

export const DEPOSIT_POLICY_DEFAULTS: DepositPolicy = {
  noShowThreshold: 2,
  riskScoreThreshold: 60,
  defaultPercentOfFee: 30,
  linkExpiryHours: 24,
  autoCancelUnpaid: false,
};

/** CR-10 — optional "cut no-shows or get N months free"; off by default. */
export const noShowGuaranteeSchema = z.object({
  enabled: z.boolean(),
  targetReductionPercent: z.number().min(1).max(100),
  creditMonths: z.number().int().min(1).max(12),
  baselineDays: z.number().int().min(7).max(90),
  evaluationDay: z.number().int().min(30).max(365),
  minBaselineAppointments: z.number().int().min(1).max(10_000),
});

export type NoShowGuaranteeConfig = z.infer<typeof noShowGuaranteeSchema>;

export const NO_SHOW_GUARANTEE_DEFAULTS: NoShowGuaranteeConfig = {
  enabled: false,
  targetReductionPercent: 30,
  creditMonths: 3,
  baselineDays: 30,
  evaluationDay: 120,
  minBaselineAppointments: 100,
};

export const SALES_REP_COMMISSION_DEFAULTS = { commissionPercent: 10, retentionDays: 90 } as const;

export const commercialConfigSchema = z
  .object({
    trial: trialSchema,
    kiorex: kiorexSchema,
    lite: liteSchema,
    dunning: dunningSchema,
    referral: referralSchema,
    salesRep: salesRepSchema.optional(),
    deposits: depositPolicySchema.optional(),
    noShowGuarantee: noShowGuaranteeSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.noShowGuarantee && val.noShowGuarantee.evaluationDay <= val.noShowGuarantee.baselineDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "evaluationDay must be greater than baselineDays",
        path: ["noShowGuarantee", "evaluationDay"],
      });
    }
    if (val.dunning.readOnlyAfterDays <= val.dunning.graceDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "readOnlyAfterDays must be greater than graceDays",
        path: ["dunning", "readOnlyAfterDays"],
      });
    }
    if (val.dunning.suspendAfterDays <= val.dunning.readOnlyAfterDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "suspendAfterDays must be greater than readOnlyAfterDays",
        path: ["dunning", "suspendAfterDays"],
      });
    }
    if (val.trial.foundingDays < val.trial.standardDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "foundingDays must be >= standardDays",
        path: ["trial", "foundingDays"],
      });
    }
  });

export type CommercialConfig = z.infer<typeof commercialConfigSchema>;

export const DEFAULT_COMMERCIAL_CONFIG: CommercialConfig = {
  trial: {
    standardDays: 90,
    foundingDays: 180,
    activation: { minVisits: 20, withinDays: 30 },
    commissionPolicy: "WAIVE_UP_TO_PLAN_PRICE",
    cohorts: [],
  },
  kiorex: {
    newPatientLookbackMonths: 24,
    disputeWindowDays: 7,
    benchmarkTargetRatio: 0.5,
    autoConfirmHours: 24,
  },
  lite: {
    commissionMonthlyCap: null,
    minInvoice: 100,
  },
  dunning: {
    graceDays: 14,
    readOnlyAfterDays: 15,
    suspendAfterDays: 45,
  },
  referral: {
    rewardMonths: 1,
    expiryMonths: 12,
    maxPerYear: 12,
  },
  noShowGuarantee: { ...NO_SHOW_GUARANTEE_DEFAULTS },
};

export function resolveNoShowGuaranteeConfig(commercialConfig: unknown): NoShowGuaranteeConfig {
  const parsed = safeParseCommercialConfig(commercialConfig);
  if (parsed.success) {
    return { ...NO_SHOW_GUARANTEE_DEFAULTS, ...(parsed.data.noShowGuarantee ?? {}) };
  }
  // Loose read when pack is partial (tests / legacy rows) — still defaults to off.
  const raw =
    commercialConfig && typeof commercialConfig === "object"
      ? (commercialConfig as { noShowGuarantee?: Partial<NoShowGuaranteeConfig> }).noShowGuarantee
      : undefined;
  const loose = noShowGuaranteeSchema.safeParse({ ...NO_SHOW_GUARANTEE_DEFAULTS, ...(raw ?? {}) });
  return loose.success ? loose.data : { ...NO_SHOW_GUARANTEE_DEFAULTS };
}

export function parseCommercialConfig(input: unknown): CommercialConfig {
  return commercialConfigSchema.parse(input);
}

export function safeParseCommercialConfig(input: unknown) {
  return commercialConfigSchema.safeParse(input);
}