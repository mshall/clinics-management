import type { Prisma } from "@prisma/client";
import {
  buildIdempotencyKey,
  signEtaPayload,
  submitEtaReceipt,
  type EtaReceiptPayload,
} from "../../compliance/eta-egypt.client";
import type { BuiltFiscalPayload, FiscalPayloadBuildContext, FiscalProvider, FiscalSubmitResult } from "./fiscal-provider.interface";

export const ETA_EGYPT_PROVIDER_KEY = "eta-egypt";

export class EtaEgyptFiscalProvider implements FiscalProvider {
  readonly key = ETA_EGYPT_PROVIDER_KEY;

  readonly settingsSchema = {
    fields: [
      { key: "branchCode", type: "string", label: "ETA branch / POS code" },
      { key: "activityCode", type: "string", label: "Taxpayer activity code" },
      { key: "itemCode", type: "string", label: "Default GPC item code" },
      { key: "secretRef", type: "secretRef", label: "Secrets Manager ref (per clinic/device)" },
    ],
  };

  buildPayload(ctx: FiscalPayloadBuildContext): BuiltFiscalPayload {
    const tax = ctx.taxConfig;
    const clinic = ctx.clinicOverrides;
    const issuerRin =
      (typeof clinic.taxRegistrationNumber === "string" ? clinic.taxRegistrationNumber : null) ||
      (typeof tax.defaultIssuerRin === "string" ? tax.defaultIssuerRin : null) ||
      "PENDING-RIN";
    const idempotencyKey = buildIdempotencyKey([
      ctx.tenantId,
      ctx.clinicId,
      String(ctx.totalAmount),
      ctx.currency,
      ctx.description.slice(0, 32),
    ]);
    const payload: EtaReceiptPayload = {
      issuerRin,
      branchCode: (typeof clinic.etaBranchCode === "string" ? clinic.etaBranchCode : ctx.clinicId.slice(0, 8)).trim(),
      documentType: "EI",
      taxpayerActivityCode:
        (typeof clinic.etaTaxpayerActivityCode === "string" ? clinic.etaTaxpayerActivityCode : null) ||
        (typeof tax.defaultActivityCode === "string" ? tax.defaultActivityCode : "8690"),
      lines: [
        {
          description: ctx.description,
          quantity: 1,
          unitPrice: ctx.totalAmount,
          vatPercent: ctx.vatPercent,
          currency: ctx.currency,
          itemCode:
            (typeof clinic.etaDefaultItemCode === "string" ? clinic.etaDefaultItemCode : undefined) ||
            (typeof tax.defaultItemCode === "string" ? tax.defaultItemCode : undefined),
        },
      ],
      totalAmount: ctx.totalAmount,
      currency: ctx.currency,
      patientId: ctx.patientId,
      clinicId: ctx.clinicId,
      idempotencyKey,
    };
    const signature = signEtaPayload(payload);
    return {
      payloadJson: payload as unknown as Prisma.InputJsonValue,
      schemaVersion: "eta-egypt-v1",
      signature,
      idempotencyKey,
    };
  }

  async submit(payload: unknown, signature: string, _secretRef?: string | null): Promise<FiscalSubmitResult> {
    const sig = signature?.trim() || signEtaPayload(payload as EtaReceiptPayload);
    const result = await submitEtaReceipt(payload as EtaReceiptPayload, sig);
    if (!result.ok) return result;
    return { ok: true, providerDocumentUuid: result.etaUuid, mode: result.mode };
  }
}