import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { CommissionDecisionsService } from "./commission-decisions.service";
import { CommissionDecisionsOverrideBodyDto } from "./commission-decisions.controller.dto";

/** GRW-P1-D2: why a Kiorex fee was or was not applied, the provider statement with reconciliation, and the audited platform override. */
@ApiTags("kiorex")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller()
export class CommissionDecisionsController {
  constructor(private readonly decisions: CommissionDecisionsService) {}

  @Get("kiorex/commission-decisions")
  @ApiOperation({ summary: "Decision log for one appointment (append-only; why a fee was or was not applied)" })
  explain(@CurrentUser() user: JwtUser, @Query("appointmentId") appointmentId: string) {
    return this.decisions.explain(user, appointmentId);
  }

  @Get("kiorex/commission-statement")
  @ApiOperation({ summary: "Provider statement for a month: decisions reconciled against charges" })
  statement(@CurrentUser() user: JwtUser, @Query("period") period?: string, @Query("clinicId") clinicId?: string) {
    return this.decisions.statement(user, { period, clinicId });
  }

  @Post("platform/kiorex/commission-decisions/override")
  @ApiOperation({ summary: "Platform super admin only: waive an active charge (GOODWILL_WAIVER or POLICY_CORRECTION); removal only, note required, audited, emits CommissionAdjusted" })
  override(@CurrentUser() user: JwtUser, @Body() body: CommissionDecisionsOverrideBodyDto) {
    return this.decisions.override(user, body ?? {});
  }
}
