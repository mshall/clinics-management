import { HttpException } from "@nestjs/common";
import type { Profession } from "@prisma/client";

export const SCOPE_NOT_ALLOWED = "SCOPE_NOT_ALLOWED";

/** PRSOP: HTTP 403 { code: SCOPE_NOT_ALLOWED, capability, profession }. Never a feature flag (ADR-025). */
export class ScopeNotAllowedException extends HttpException {
  constructor(
    readonly capability: string,
    readonly profession: Profession,
  ) {
    super(
      {
        statusCode: 403,
        code: SCOPE_NOT_ALLOWED,
        capability,
        profession,
        message: "This action is outside the scope of practice of your profession.",
        messageAr: "هذا الإجراء خارج نطاق ممارسة مهنتك.",
      },
      403,
    );
  }
}
