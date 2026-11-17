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

const kiorexSchema = z.object({
  newPatientLookbackMonths: z.number().int().min(1).max(120),
  disputeWindowDays: z.number().int().min(1).max(90),
  benchmarkTargetRatio: z.number().min(0.05).max(1.5),
  autoConfirmHours: z.number().int().min(1).max(168),
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

export const commercialConfigSchema = z
  .object({
    trial: trialSchema,
    kiorex: kiorexSchema,
    lite: liteSchema,
    dunning: dunningSchema,
    referral: referralSchema,
  })
  .superRefine((val, ctx) => {
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
};

export function parseCommercialConfig(input: unknown): CommercialConfig {
  return commercialConfigSchema.parse(input);
}

export function safeParseCommercialConfig(input: unknown) {
  return commercialConfigSchema.safeParse(input);
}