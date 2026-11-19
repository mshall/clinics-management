import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CommissionDisputeStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { CommissionDisputeService } from "./commission-dispute.service";
import { ResolveCommissionDisputeDto } from "./dto/resolve-commission-dispute.dto";

@ApiTags("admin-platform")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("admin/platform/disputes")
export class PlatformCommissionDisputesController {
  constructor(private readonly disputes: CommissionDisputeService) {}

  @Get()
  @ApiOperation({ summary: "Kiorex commission dispute ops queue (platform super admin)" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("status") status?: CommissionDisputeStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.disputes.listForPlatform(user, {
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post(":id/resolve")
  @ApiOperation({ summary: "Approve or reject an open commission dispute" })
  resolve(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: ResolveCommissionDisputeDto) {
    return this.disputes.resolve(user, id, body);
  }
}