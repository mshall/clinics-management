import { HttpException } from "@nestjs/common";

/** Stable machine codes the call page and the public link page branch on. */
export type TelehealthErrorCode =
  | "TELEHEALTH_TOO_EARLY" | "TELEHEALTH_EXPIRED" | "TELEHEALTH_CANCELLED" | "TELEHEALTH_CONVERTED_IN_PERSON" | "TELEHEALTH_ENDED"
  | "TELEHEALTH_MISSED" | "TELEHEALTH_LINK_REVOKED" | "TELEHEALTH_LINK_INVALID" | "PAYMENT_REQUIRED" | "TELEHEALTH_NOT_FOUND"
  | "TELEHEALTH_FORBIDDEN" | "TELEHEALTH_RATE_LIMITED" | "TELEHEALTH_BAD_SIGNAL";

const STATUS: Record<TelehealthErrorCode, number> = {
  TELEHEALTH_TOO_EARLY: 409, TELEHEALTH_EXPIRED: 410, TELEHEALTH_CANCELLED: 410, TELEHEALTH_CONVERTED_IN_PERSON: 410, TELEHEALTH_ENDED: 410,
  TELEHEALTH_MISSED: 410, TELEHEALTH_LINK_REVOKED: 410, TELEHEALTH_LINK_INVALID: 404, PAYMENT_REQUIRED: 402, TELEHEALTH_NOT_FOUND: 404,
  TELEHEALTH_FORBIDDEN: 403, TELEHEALTH_RATE_LIMITED: 429, TELEHEALTH_BAD_SIGNAL: 400,
};

export class TelehealthException extends HttpException {
  constructor(code: TelehealthErrorCode, extra: Record<string, unknown> = {}) {
    super({ code, messageKey: `telehealth.errors.${code}`, message: code, ...extra }, STATUS[code]);
  }
}
