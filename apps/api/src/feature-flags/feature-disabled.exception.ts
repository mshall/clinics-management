import { HttpException } from "@nestjs/common";
import type { FlagScopeName } from "./feature-flag-keys";

export const FEATURE_DISABLED = "FEATURE_DISABLED";

/** Universal OFF contract (KX-08 §08): HTTP 403 { code: FEATURE_DISABLED, key, scope }. Never hides existing data. */
export class FeatureDisabledException extends HttpException {
  constructor(
    readonly key: string,
    readonly scope: FlagScopeName,
  ) {
    super(
      {
        statusCode: 403,
        code: FEATURE_DISABLED,
        key,
        scope,
        message: "This capability is temporarily unavailable.",
        messageAr: "هذه الميزة غير متاحة مؤقتًا.",
      },
      403,
    );
  }
}
