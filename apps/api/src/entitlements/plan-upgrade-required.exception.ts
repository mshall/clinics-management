import { HttpException } from "@nestjs/common";
import type { PlanKey } from "@prisma/client";

export const PLAN_UPGRADE_REQUIRED = "PLAN_UPGRADE_REQUIRED";

export class PlanUpgradeRequiredException extends HttpException {
  constructor(entitlement: string, requiredPlan: PlanKey) {
    super(
      {
        code: PLAN_UPGRADE_REQUIRED,
        entitlement,
        requiredPlan,
      },
      402,
    );
  }
}