import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ImportEntity, UserRole } from "@prisma/client";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import type { JwtUser } from "../../auth/jwt-user";
import { requireTenantId } from "../../auth/require-tenant";
import { hasAnyRole, isTenantOwnerPrincipal } from "../../common/effective-roles";
import { templateCsv } from "./import-templates";
import { ImportsService, type DedupeMode } from "./imports.service";

const IMPORT_ROLES = [UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN, UserRole.BRANCH_MANAGER] as const;

export function assertCanImport(user: JwtUser): void {
  if (isTenantOwnerPrincipal(user) || hasAnyRole(user, IMPORT_ROLES)) return;
  throw new ForbiddenException("Only the clinic owner or an admin can import data");
}

function parseEntity(raw: string | undefined): ImportEntity {
  const e = (raw ?? "").toUpperCase() as ImportEntity;
  if (!Object.values(ImportEntity).includes(e)) throw new BadRequestException("entity must be PATIENTS, APPOINTMENTS, PRICE_LIST or STAFF");
  return e;
}

@ApiTags("imports")
@ApiBearerAuth("bearer")
@Controller("imports")
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get("templates/:entity")
  @ApiOperation({ summary: "Download a CSV template with English or Arabic headers (ON-05)" })
  template(@CurrentUser() user: JwtUser, @Param("entity") entity: string, @Query("lang") lang: string | undefined, @Res() res: Response) {
    requireTenantId(user);
    const e = parseEntity(entity);
    const l = lang === "ar" ? "ar" : "en";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kiorly-${e.toLowerCase()}-template-${l}.csv"`);
    res.send(templateCsv(e, l));
  }

  @Get()
  @ApiOperation({ summary: "Recent import jobs" })
  list(@CurrentUser() user: JwtUser) {
    assertCanImport(user);
    return this.imports.list(requireTenantId(user));
  }

  @Post()
  @ApiOperation({ summary: "Upload xlsx/csv → validate → preview job (ON-05)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "entity"],
      properties: {
        file: { type: "string", format: "binary" },
        entity: { type: "string", enum: Object.values(ImportEntity) },
        dedupeMode: { type: "string", enum: ["SKIP", "MERGE"] },
      },
    },
  })
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("entity") entity: string,
    @Body("dedupeMode") dedupeMode?: string,
  ) {
    assertCanImport(user);
    if (!file?.buffer?.length) throw new BadRequestException("file is required");
    return this.imports.upload(
      { tenantId: requireTenantId(user), userId: user.userId },
      parseEntity(entity),
      file,
      (dedupeMode?.toUpperCase() as DedupeMode | undefined) ?? "SKIP",
    );
  }

  @Get(":id")
  get(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    assertCanImport(user);
    return this.imports.get(requireTenantId(user), id);
  }

  @Get(":id/error-report")
  @ApiOperation({ summary: "Download row errors as CSV" })
  async errorReport(@CurrentUser() user: JwtUser, @Param("id") id: string, @Res() res: Response) {
    assertCanImport(user);
    const report = await this.imports.errorReport(requireTenantId(user), id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
    report.stream.pipe(res);
  }

  @Post(":id/commit")
  @HttpCode(202)
  @ApiOperation({ summary: "Commit valid rows in the background" })
  commit(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body("dedupeMode") dedupeMode?: string) {
    assertCanImport(user);
    return this.imports.commit(
      { tenantId: requireTenantId(user), userId: user.userId },
      id,
      dedupeMode ? (dedupeMode.toUpperCase() as DedupeMode) : undefined,
    );
  }

  @Post(":id/undo")
  @HttpCode(200)
  @ApiOperation({ summary: "Undo within 24h (deletes untouched rows created by the job)" })
  undo(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    assertCanImport(user);
    return this.imports.undo({ tenantId: requireTenantId(user), userId: user.userId }, id);
  }
}
