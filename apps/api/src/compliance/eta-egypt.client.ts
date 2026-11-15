import { createHmac, randomUUID } from "crypto";
import type { EtaConnectionConfig } from "./eta-secret-resolver";

export type EtaReceiptPayload = {
  issuerRin: string;
  branchCode: string;
  documentType: "R";
  receiptUuid: string;
  previousReceiptUuid?: string;
  taxpayerActivityCode: string;
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
    currency: string;
    itemCode?: string;
  }[];
  totalAmount: number;
  currency: string;
  patientId: string;
  clinicId: string;
  idempotencyKey: string;
  documentNature: "sale" | "return";
};

export function buildIdempotencyKey(parts: string[]): string {
  return parts.filter(Boolean).join(":");
}

export function signEtaPayload(payload: EtaReceiptPayload, signingKeyOverride?: string | null): string {
  const key =
    signingKeyOverride?.trim() ||
    process.env.ETA_SIGNING_KEY?.trim() ||
    process.env.ETA_CLIENT_SECRET?.trim();
  if (!key) return "";
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHmac("sha256", key).update(canonical).digest("hex");
}

export type EtaSubmitResult =
  | { ok: true; etaUuid: string; mode: "live" | "sandbox" }
  | { ok: false; error: string; mode: "unconfigured" | "live" };

export async function submitEtaReceipt(
  payload: EtaReceiptPayload,
  signature: string,
  connection?: EtaConnectionConfig | null,
): Promise<EtaSubmitResult> {
  const baseUrl = connection?.baseUrl?.trim() || process.env.ETA_API_BASE_URL?.trim();
  const clientId = connection?.clientId?.trim() || process.env.ETA_CLIENT_ID?.trim();
  if (!baseUrl || !clientId) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "ETA credentials are not configured", mode: "unconfigured" };
    }
    return { ok: true, etaUuid: payload.receiptUuid || randomUUID(), mode: "sandbox" };
  }

  const tokenUrl =
    connection?.tokenUrl?.trim() ||
    process.env.ETA_TOKEN_URL?.trim() ||
    `${baseUrl.replace(/\/$/, "")}/connect/token`;
  const clientSecret = connection?.clientSecret?.trim() || process.env.ETA_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    return { ok: false, error: "ETA client secret is missing", mode: "unconfigured" };
  }

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: connection?.oauthScope?.trim() || process.env.ETA_OAUTH_SCOPE?.trim() || "InvoicingAPI",
    }),
  });
  if (!tokenRes.ok) {
    return { ok: false, error: `ETA token request failed (${tokenRes.status})`, mode: "live" };
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    return { ok: false, error: "ETA token response missing access_token", mode: "live" };
  }

  const submitPath =
    connection?.receiptSubmitPath?.trim() || process.env.ETA_RECEIPT_SUBMIT_PATH?.trim() || "/api/v1/receiptsubmissions";
  const submitRes = await fetch(`${baseUrl.replace(/\/$/, "")}${submitPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ documents: [payload] }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    return { ok: false, error: `ETA submit failed (${submitRes.status}): ${text.slice(0, 500)}`, mode: "live" };
  }

  const out = (await submitRes.json()) as {
    submissionUUID?: string;
    uuid?: string;
    acceptedDocuments?: { uuid?: string }[];
  };
  const etaUuid = out.submissionUUID ?? out.uuid ?? out.acceptedDocuments?.[0]?.uuid;
  if (!etaUuid?.trim()) {
    return { ok: false, error: "ETA submit response did not include a document UUID", mode: "live" };
  }
  return { ok: true, etaUuid: etaUuid.trim(), mode: "live" };
}