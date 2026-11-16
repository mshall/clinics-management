import { createHmac, randomUUID } from "crypto";
import type { EtaConnectionConfig } from "./eta-secret-resolver";
import type { EtaWireReceiptDocument } from "./eta-egypt-wire";
import { classifyEtaHttpFailure, classifyEtaNetworkError, type EtaFailureClass } from "./eta-submit-classify";

export type EtaReceiptPayload = {
  issuerRin: string;
  branchCode: string;
  documentType: "R";
  receiptUuid: string;
  previousReceiptUuid?: string;
  referenceReceiptUuid?: string;
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
  exchangeRate?: number;
  paymentMethod?: string;
  buyerName?: string;
  patientId: string;
  clinicId: string;
  idempotencyKey: string;
  documentNature: "sale" | "return";
};

export type EtaPosHeaders = {
  posSerial: string;
  posOsVersion?: string;
  posModelFramework?: string;
  presharedKey?: string;
};

export function buildIdempotencyKey(parts: string[]): string {
  return parts.filter(Boolean).join(":");
}

export function signEtaWireDocument(
  wire: EtaWireReceiptDocument,
  signingKeyOverride?: string | null,
): string {
  const key =
    signingKeyOverride?.trim() ||
    process.env.ETA_SIGNING_KEY?.trim() ||
    process.env.ETA_CLIENT_SECRET?.trim();
  if (!key) return "";
  const canonical = JSON.stringify(wire, Object.keys(wire).sort());
  return createHmac("sha256", key).update(canonical).digest("hex");
}

/** @deprecated sign wire document at prepare time */
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
  | { ok: true; receiptUuid: string; mode: "live" | "sandbox"; httpStatus?: number }
  | {
      ok: false;
      error: string;
      mode: "unconfigured" | "live";
      failureClass: EtaFailureClass;
      httpStatus?: number;
    };

function posHeaderBlock(pos?: EtaPosHeaders): Record<string, string> {
  if (!pos?.posSerial?.trim()) return {};
  return {
    posserial: pos.posSerial.trim(),
    pososversion: pos.posOsVersion?.trim() || "1.0",
    posmodelframework: pos.posModelFramework?.trim() || "1.0",
    ...(pos.presharedKey?.trim() ? { presharedkey: pos.presharedKey.trim() } : {}),
  };
}

async function obtainEtaAccessToken(
  baseUrl: string,
  connection: EtaConnectionConfig | null | undefined,
  posHeaders: Record<string, string>,
): Promise<{ ok: true; token: string } | { ok: false; error: string; failureClass: EtaFailureClass; httpStatus?: number }> {
  const clientId = connection?.clientId?.trim() || process.env.ETA_CLIENT_ID?.trim();
  const clientSecret = connection?.clientSecret?.trim() || process.env.ETA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return { ok: false, error: "ETA client credentials are missing", failureClass: "permanent" };
  }
  const tokenUrl =
    connection?.tokenUrl?.trim() ||
    process.env.ETA_TOKEN_URL?.trim() ||
    `${baseUrl.replace(/\/$/, "")}/connect/token`;
  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...posHeaders },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: connection?.oauthScope?.trim() || process.env.ETA_OAUTH_SCOPE?.trim() || "InvoicingAPI",
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return {
        ok: false,
        error: `ETA token request failed (${tokenRes.status}): ${text.slice(0, 300)}`,
        failureClass: classifyEtaHttpFailure(tokenRes.status, text),
        httpStatus: tokenRes.status,
      };
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      return { ok: false, error: "ETA token response missing access_token", failureClass: "unclear" };
    }
    return { ok: true, token: accessToken };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, failureClass: classifyEtaNetworkError(msg) };
  }
}

/** Submit the exact wire document built at prepare time — no rebuild. */
export async function submitEtaWireDocument(
  wireDocument: EtaWireReceiptDocument,
  signature: string,
  connection?: EtaConnectionConfig | null,
  pos?: EtaPosHeaders,
): Promise<EtaSubmitResult> {
  const baseUrl = connection?.baseUrl?.trim() || process.env.ETA_API_BASE_URL?.trim();
  if (!baseUrl || !(connection?.clientId?.trim() || process.env.ETA_CLIENT_ID?.trim())) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error: "ETA credentials are not configured",
        mode: "unconfigured",
        failureClass: "permanent",
      };
    }
    const uuid = wireDocument.header.uuid?.trim() || randomUUID().replace(/-/g, "");
    return { ok: true, receiptUuid: uuid, mode: "sandbox" };
  }

  const posHeaders = posHeaderBlock(pos);
  const tokenOut = await obtainEtaAccessToken(baseUrl, connection, posHeaders);
  if (!tokenOut.ok) {
    return { ok: false, error: tokenOut.error, mode: "live", failureClass: tokenOut.failureClass, httpStatus: tokenOut.httpStatus };
  }

  const submitPath =
    connection?.receiptSubmitPath?.trim() ||
    process.env.ETA_RECEIPT_SUBMIT_PATH?.trim() ||
    "/api/v1/receiptsubmissions";
  const body = JSON.stringify({ documents: [wireDocument] });

  try {
    const submitRes = await fetch(`${baseUrl.replace(/\/$/, "")}${submitPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOut.token}`,
        ...(signature ? { "X-Signature": signature } : {}),
        ...posHeaders,
      },
      body,
    });

    if (!submitRes.ok) {
      const text = await submitRes.text();
      return {
        ok: false,
        error: `ETA submit failed (${submitRes.status}): ${text.slice(0, 500)}`,
        mode: "live",
        failureClass: classifyEtaHttpFailure(submitRes.status, text),
        httpStatus: submitRes.status,
      };
    }

    const out = (await submitRes.json()) as {
      submissionUUID?: string;
      uuid?: string;
      acceptedDocuments?: { uuid?: string }[];
    };
    const etaUuid =
      out.acceptedDocuments?.[0]?.uuid?.trim() ||
      out.submissionUUID?.trim() ||
      out.uuid?.trim() ||
      wireDocument.header.uuid?.trim();
    if (!etaUuid) {
      return {
        ok: false,
        error: "ETA submit response did not include a document UUID",
        mode: "live",
        failureClass: "unclear",
        httpStatus: submitRes.status,
      };
    }
    return { ok: true, receiptUuid: etaUuid, mode: "live", httpStatus: submitRes.status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, mode: "live", failureClass: classifyEtaNetworkError(msg) };
  }
}

/** Poll receipt validity when submit outcome is unclear (pre-production / when configured). */
export async function fetchEtaReceiptValidationStatus(
  receiptUuid: string,
  connection?: EtaConnectionConfig | null,
  pos?: EtaPosHeaders,
): Promise<"VALID" | "INVALID" | "UNKNOWN" | null> {
  const baseUrl = connection?.baseUrl?.trim() || process.env.ETA_API_BASE_URL?.trim();
  const path =
    process.env.ETA_RECEIPT_STATUS_PATH?.trim() ||
    connection?.receiptStatusPath?.trim();
  if (!baseUrl || !path) return null;

  const posHeaders = posHeaderBlock(pos);
  const tokenOut = await obtainEtaAccessToken(baseUrl, connection, posHeaders);
  if (!tokenOut.ok) return "UNKNOWN";

  const url = `${baseUrl.replace(/\/$/, "")}${path.replace("{uuid}", receiptUuid)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tokenOut.token}`, ...posHeaders },
    });
    if (!res.ok) return "UNKNOWN";
    const body = (await res.json()) as { status?: string; valid?: boolean };
    if (body.valid === true || body.status === "Valid") return "VALID";
    if (body.valid === false || body.status === "Invalid") return "INVALID";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

/** @deprecated use submitEtaWireDocument with stored wire */
export async function submitEtaReceipt(
  _payload: EtaReceiptPayload,
  signature: string,
  connection?: EtaConnectionConfig | null,
  pos?: EtaPosHeaders,
): Promise<EtaSubmitResult> {
  return {
    ok: false,
    error: "submitEtaReceipt requires a stored wire document; use submitEtaWireDocument",
    mode: "live",
    failureClass: "permanent",
  };
}