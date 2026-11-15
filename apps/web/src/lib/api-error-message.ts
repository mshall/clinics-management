import type { TFunction } from "i18next";
import i18n from "@/lib/i18n";
import { ApiError } from "@/lib/http";

type ErrorBody = {
  message?: unknown;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  error?: unknown;
  statusCode?: number;
};

function rawMessageFromBody(status: number, body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const o = body as ErrorBody;
    if (Array.isArray(o.message)) return o.message.map((x) => String(x)).join("; ");
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (status === 503 && typeof o.error === "string") {
      return `${o.error}. ${typeof o.message === "string" ? o.message : fallback}`;
    }
  }
  return fallback;
}

const MESSAGE_PATTERNS: { re: RegExp; key: string; params?: (m: RegExpMatchArray) => Record<string, unknown> }[] = [
  { re: /^File too large \(max (\d+)MB\)$/i, key: "errors.upload.fileTooLarge", params: (m) => ({ maxMb: Number(m[1]) }) },
  { re: /^File is required\.?$/i, key: "errors.upload.fileRequired" },
  { re: /^A file is required/i, key: "errors.upload.fileRequired" },
  { re: /^Document description is required/i, key: "errors.upload.descriptionRequired" },
  { re: /^Unsupported file type: (.+)$/i, key: "errors.upload.unsupportedType", params: (m) => ({ mime: m[1] }) },
  { re: /^Only image documents can be cropped/i, key: "errors.upload.imagesOnly" },
  { re: /^Payload Too Large/i, key: "errors.upload.fileTooLarge", params: () => ({ maxMb: 15 }) },
  { re: /^NetworkError|Failed to fetch|Load failed/i, key: "errors.network" },
  { re: /^Request failed$/i, key: "errors.requestFailed" },
];

export function localizeApiErrorMessage(
  status: number,
  body: unknown,
  fallback: string,
  t: TFunction = i18n.t.bind(i18n),
): string {
  if (body && typeof body === "object") {
    const o = body as ErrorBody;
    if (typeof o.messageKey === "string" && o.messageKey.trim()) {
      const params = (o.messageParams ?? {}) as Record<string, string | number>;
      const translated = t(o.messageKey, rawMessageFromBody(status, body, fallback), params);
      if (translated && translated !== o.messageKey) return translated;
    }
  }

  const raw = rawMessageFromBody(status, body, fallback);
  for (const { re, key, params } of MESSAGE_PATTERNS) {
    const m = raw.match(re);
    if (m) return t(key, raw, params?.(m) ?? {});
  }

  if (status === 401) return t("errors.unauthorized", "Your session expired. Please sign in again.");
  if (status === 403) return t("errors.forbidden", "You do not have permission for this action.");
  if (status === 404) return t("errors.notFound", "The requested record was not found.");
  if (status === 413) return t("errors.upload.fileTooLarge", raw, { maxMb: 15 });
  if (status >= 500) return t("errors.server", "Something went wrong on the server. Please try again in a moment.");

  return raw || t("errors.requestFailed", fallback);
}

export function apiErrorMessage(e: unknown, t?: TFunction): string {
  const translate = t ?? i18n.t.bind(i18n);
  if (e instanceof ApiError) {
    return localizeApiErrorMessage(e.status, e.body, e.message, translate);
  }
  if (e instanceof Error && e.message) {
    for (const { re, key, params } of MESSAGE_PATTERNS) {
      const m = e.message.match(re);
      if (m) return translate(key, e.message, params?.(m) ?? {});
    }
    return e.message;
  }
  return translate("errors.unknown", String(e));
}