import { z } from "zod";
import { SC01_SUB_PROCESSOR_IDS } from "./sub-processor-registry";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const crossBorderTransferSchema = z.object({
  approvalRef: z.string().trim().min(1).max(128),
  issuedAt: isoDate,
  expiresAt: isoDate,
  destination: z.string().trim().min(1).max(256),
  scope: z.string().trim().min(1).max(2000).optional(),
  subProcessors: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    .max(50)
    .superRefine((ids, ctx) => {
      for (let i = 0; i < ids.length; i++) {
        if (!SC01_SUB_PROCESSOR_IDS.has(ids[i]!)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown sub-processor id: ${ids[i]}`,
            path: [i],
          });
        }
      }
    }),
});

export const pilotExceptionSchema = z.object({
  active: z.boolean(),
  legalRef: z.string().trim().min(1).max(256),
  note: z.string().trim().max(2000).optional(),
  expiresAt: isoDate.optional(),
});

export const legalConfigSchema = z.object({
  crossBorderTransfer: crossBorderTransferSchema.optional(),
  pilotException: pilotExceptionSchema.optional(),
});

export type LegalConfig = z.infer<typeof legalConfigSchema>;
export type CrossBorderTransfer = z.infer<typeof crossBorderTransferSchema>;

export function safeParseLegalConfig(raw: unknown) {
  return legalConfigSchema.safeParse(raw ?? {});
}

export function parseLegalConfig(raw: unknown): LegalConfig {
  const parsed = safeParseLegalConfig(raw);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}