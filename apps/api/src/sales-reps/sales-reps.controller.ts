import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ImportEntity } from "@prisma/client";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ImportsService, type DedupeMode } from "../onboarding/imports/imports.service";
import { SalesRepsService, type RepCreateTenantInput } from "./sales-reps.service";

@ApiTags("sales-reps")
@ApiBearerAuth("bearer")
@Controller("rep")
@UseGuards(JwtAuthGuard)
export class SalesRepsController {
  constructor(
    private readonly reps: SalesRepsService,
    private readonly imports: ImportsService,
  ) {}

  @Get("me")
  me(@CurrentUser() user: JwtUser) {
    return this.reps.me(user);
  }

  @Post("tenants")
  @ApiOperation({ summary: "Create a clinic on behalf of its owner; stays PENDING_OWNER until owner OTP (ON-07)" })
  createTenant(@CurrentUser() user: JwtUser, @Body() body: RepCreateTenantInput) {
    return this.reps.createTenant(user, body);
  }

  @Post("tenants/:id/resend-otp")
  @HttpCode(200)
  resendOtp(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.reps.resendOwnerOtp(user, id);
  }

  @Post("tenants/:id/confirm")
  @HttpCode(200)
  @ApiOperation({ summary: "Owner confirms creation with the OTP sent to their phone (ON-07)" })
  confirm(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { code?: string; legalAcceptances?: { document: string; version: string }[] },
  ) {
    return this.reps.confirmOwner(user, id, body);
  }

  @Get("portfolio")
  portfolio(@CurrentUser() user: JwtUser) {
    return this.reps.portfolio(user);
  }

  @Get("commission")
  commission(@CurrentUser() user: JwtUser, @Query("period") period?: string) {
    return this.reps.commission(user, period);
  }

  @Get("tenants/:id/imports")
  async listImports(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    const actor = await this.reps.importActor(user, id);
    return this.imports.list(actor.tenantId);
  }

  @Post("tenants/:id/imports")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { entity?: string; dedupeMode?: string },
  ) {
    if (!file) throw new BadRequestException("file is required");
    const actor = await this.reps.importActor(user, id);
    const entity = (body.entity ?? "").toUpperCase() as ImportEntity;
    if (!Object.values(ImportEntity).includes(entity)) throw new BadRequestException("entity is invalid");
    return this.imports.upload(actor, entity, file, (body.dedupeMode as DedupeMode | undefined) ?? "SKIP");
  }

  @Post("tenants/:id/imports/:jobId/commit")
  @HttpCode(202)
  async commit(@CurrentUser() user: JwtUser, @Param("id") id: string, @Param("jobId") jobId: string) {
    const actor = await this.reps.importActor(user, id);
    return this.imports.commit(actor, jobId);
  }
}

@ApiTags("sales-reps")
@ApiBearerAuth("bearer")
@Controller("platform/sales-reps")
@UseGuards(JwtAuthGuard)
export class PlatformSalesRepsController {
  constructor(private readonly reps: SalesRepsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.reps.listReps(user);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: { email?: string; displayName?: string; code?: string; phone?: string; password?: string },
  ) {
    return this.reps.createRep(user, body);
  }
}
