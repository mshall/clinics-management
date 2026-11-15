import type { Prisma } from "@prisma/client";
import { resolveEtaConnection } from "../../compliance/eta-secret-resolver";
import {
  signEtaPayload,
  submitEtaReceipt,
  type EtaReceiptPayload,
} from "../../compliance/eta-egypt.client";
import type { BuiltFiscalPayload, FiscalPayloadBuildContext, FiscalProvider, FiscalSubmitResult } from "./fiscal-provider.interface";

export const ETA_EGYPT_PROVIDER_KEY = "eta-egypt";

import { computeEtaReceiptUuid } from "../../compliance/eta-egypt-serialize";

export class EtaEgyptFiscalProvider implements FiscalProvider {
  readonly key = ETA_EGYPT_PROVIDER_KEY;

  readonly deviceRegistration = {
    required: true,
    credentialFields: [
      { key: "clientId", type: "string", labelKey: "fiscalDevices.fieldClientId" },
      { key: "clientSecret", type: "secret", labelKey: "fiscalDevices.fieldClientSecret" },
    ],
    registrationGuideKey: "fiscalDevices.registrationGuide",
  };

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
      (typeof clinic.taxRegistrationNumber === "string" ? clinic.taxRegistrationNumber.trim() : "") ||
      (typeof tax.defaultIssuerRin === "string" ? tax.defaultIssuerRin.trim() : "");
    if (!issuerRin) {
      throw new Error("Clinic tax registration (RIN) is required before queuing ETA receipts");
    }
    const payload: EtaReceiptPayload = {
      issuerRin,
      branchCode: (typeof clinic.branchCode === "string" ? clinic.branchCode : ctx.clinicId.slice(0, 8)).trim(),
      documentType: "R",
      receiptUuid: ctx.receiptUuid?.trim() || "",
      referenceReceiptUuid: ctx.referenceReceiptUuid?.trim() || undefined,
      taxpayerActivityCode:
        (typeof clinic.taxpayerActivityCode === "string" ? clinic.taxpayerActivityCode : null) ||
        (typeof tax.defaultActivityCode === "string" ? tax.defaultActivityCode : "8690"),
      lines: [
        {
          description: ctx.description,
          quantity: 1,
          unitPrice: ctx.totalAmount,
          vatPercent: ctx.vatPercent,
          currency: ctx.currency,
          itemCode:
            (typeof clinic.defaultItemCode === "string" ? clinic.defaultItemCode : undefined) ||
            (typeof tax.defaultItemCode === "string" ? tax.defaultItemCode : undefined),
        },
      ],
      totalAmount: ctx.totalAmount,
      currency: ctx.currency,
      paymentMethod:
        typeof clinic.paymentMethod === "string" ? clinic.paymentMethod.trim() : undefined,
      buyerName: typeof clinic.buyerName === "string" ? clinic.buyerName.trim() : undefined,
      patientId: ctx.patientId,
      clinicId: ctx.clinicId,
      idempotencyKey: ctx.idempotencyKey,
      documentNature: ctx.documentNature ?? "sale",
    };
    const signature = signEtaPayload(payload);
    return {
      payloadJson: payload as unknown as Prisma.InputJsonValue,
      schemaVersion: "eta-egypt-v2",
      signature,
      idempotencyKey: ctx.idempotencyKey,
    };
  }

  computeDocumentUuid(wireDocument: unknown, _previousUuid: string): string {
    const doc = wireDocument as Record<string, unknown>;
    const header =
      doc.header && typeof doc.header === "object" ? { ...(doc.header as Record<string, unknown>), uuid: "" } : { uuid: "" };
    return computeEtaReceiptUuid({ ...doc, header });
  }

  async submit(payload: unknown, signature: string, secretRef?: string | null): Promise<FiscalSubmitResult> {
    const connection = await resolveEtaConnection(secretRef);
    const sig = signature?.trim() || signEtaPayload(payload as EtaReceiptPayload, connection?.signingKey);
    const result = await submitEtaReceipt(payload as EtaReceiptPayload, sig, connection);
    if (!result.ok) return result;
    return { ok: true, providerDocumentUuid: result.receiptUuid, mode: result.mode };
  }
}