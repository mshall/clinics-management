import { Body, Controller, Get, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { VerificationStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ClinicianVerificationService } from "./clinician-verification.service";
import { PlatformVerificationDecisionDto } from "./dto/platform-verification-decision.dto";
import type { VerificationDocumentKind } from "./verification-documents";

@ApiTags("platform")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("admin/platform/verifications")
export class PlatformVerificationsController {
  constructor(private readonly service: ClinicianVerificationService) {}

  @Get("review-config")
  reviewConfig(@CurrentUser() user: JwtUser) {
    return this.service.getPlatformReviewConfig(user);
  }

  @Get("metrics")
  metrics(@CurrentUser() user: JwtUser) {
    return this.service.getPlatformReviewMetrics(user);
  }

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query("status") status?: VerificationStatus,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.listForPlatform(user, {
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post(":id/decision")
  decide(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PlatformVerificationDecisionDto) {
    return this.service.platformDecision(user, id, body);
  }

  @Get(":id/national-id")
  revealNationalId(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.service.revealNationalIdForPlatform(user, id);
  }

  @Get(":id/documents/:kind/file")
  async downloadForReview(
    @CurrentUser() user: JwtUser,
    @Param("id") verificationId: string,
    @Param("kind") kind: VerificationDocumentKind,
  ): Promise<StreamableFile> {
    const clinicianUserId = await this.service.resolveUserIdForVerificationId(verificationId);
    return this.service.streamDocument(user, clinicianUserId, kind, { platformReview: true });
  }
}