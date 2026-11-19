import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { diskStorage } from "multer";
import { mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { CurrentUser } from "../../auth/current-user.decorator";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { EntitlementGuard } from "../../entitlements/entitlement.guard";
import { RequiresEntitlement } from "../../entitlements/requires-entitlement.decorator";
import type { JwtUser } from "../../auth/jwt-user";
import { AdminDataExplorerService } from "./admin-data-explorer.service";
import { OrgBackupService, type OrgBackupFormat } from "./org-backup.service";
import { SubscriptionAccessGuard } from "../../subscriptions/subscription-access.guard";
import { RequiresSubscriptionAccess } from "../../subscriptions/requires-subscription-access.decorator";
import { SubscriptionAccessAction } from "../../subscriptions/subscription-access-policy";

const IMPORT_TMP_DIR = join(process.cwd(), ".data", "imports");
mkdirSync(IMPORT_TMP_DIR, { recursive: true });

@ApiTags("admin-data-explorer")
@ApiBearerAuth("bearer")
@Controller("admin/data-explorer")
@UseGuards(JwtAuthGuard, EntitlementGuard, SubscriptionAccessGuard)
@RequiresEntitlement("mod_data_explorer")
export class AdminDataExplorerController {
  constructor(
    private readonly explorer: AdminDataExplorerService,
    private readonly orgBackup: OrgBackupService,
  ) {}

  @Get("tables")
  @ApiOperation({ summary: "List allowlisted tables and supported operations (group admin or platform super admin)" })
  @ApiOkResponse()
  tables(@CurrentUser() user: JwtUser) {
    return this.explorer.catalog(user);
  }

  @Post("export/jobs")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiOperation({ summary: "Start async organization export (SQL, documents ZIP, or full backup ZIP)" })
  startExportJob(
    @CurrentUser() user: JwtUser,
    @Body() body: { format: OrgBackupFormat; tables?: string[] },
  ) {
    return this.orgBackup.startExport(user, body.format, body.tables);
  }

  @Get("export/jobs")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiOperation({ summary: "List recent organization export/import jobs" })
  listExportJobs(@CurrentUser() user: JwtUser, @Query("limit") limit?: string) {
    const n = limit ? Number(limit) : 12;
    return this.orgBackup.listRecentJobs(user, Number.isFinite(n) ? n : 12);
  }

  @Get("export/jobs/:id")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiOperation({ summary: "Poll organization export/import job progress" })
  getExportJob(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.orgBackup.getJob(user, id);
  }

  @Get("export/jobs/:id/download")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiOperation({ summary: "Stream a READY organization export artifact (authenticated)" })
  async downloadExportJob(@CurrentUser() user: JwtUser, @Param("id") id: string, @Res() res: Response) {
    const file = await this.orgBackup.downloadJob(user, id);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    const stream = this.orgBackup.openArtifactStream(file.artifactPath);
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    stream.pipe(res);
  }

  @Post("import")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiOperation({ summary: "Import organization backup (.sql or full/documents .zip with files)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, IMPORT_TMP_DIR),
        filename: (_req, file, cb) => {
          const safe = (file.originalname || "backup").replace(/[^\w.\-]+/g, "_").slice(0, 120);
          cb(null, `${Date.now()}-${randomBytes(8).toString("hex")}-${safe}`);
        },
      }),
      // Large full backups; processing is async after upload so the HTTP request only covers transfer.
      limits: { fileSize: 512 * 1024 * 1024 },
    }),
  )
  importBackup(@CurrentUser() user: JwtUser, @UploadedFile() file: Express.Multer.File) {
    return this.orgBackup.startImport(user, file);
  }

  @Get("export/sql")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiOperation({ summary: "Download selected organization entities as a single SQL file (sync)" })
  @ApiOkResponse({ description: "SQL script with INSERT statements for selected entities" })
  async exportSql(@CurrentUser() user: JwtUser, @Res() res: Response, @Query("tables") tables?: string) {
    const tableList = tables?.split(",").map((t) => t.trim()).filter(Boolean);
    const sql = await this.explorer.exportSql(user, tableList);
    const tenantId = user.tenantId ?? "org";
    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="kiorly-org-${tenantId}-export.sql"`);
    res.send(sql);
  }

  @Get("export/documents")
  @RequiresSubscriptionAccess(SubscriptionAccessAction.EXPORT)
  @ApiOperation({ summary: "Download uploaded files linked to selected organization entities as a ZIP archive (sync)" })
  @ApiOkResponse({ description: "ZIP archive of documents from object storage with manifest.json" })
  async exportDocuments(@CurrentUser() user: JwtUser, @Res() res: Response, @Query("tables") tables?: string) {
    const tableList = tables?.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const archive = await this.explorer.exportDocumentsArchive(user, tableList);
      const tenantId = user.tenantId ?? "org";
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="kiorly-org-${tenantId}-documents.zip"`);
      archive.on("error", (err: Error) => {
        if (!res.headersSent) {
          res.status(500).json({ message: err.message });
        } else {
          res.end();
        }
      });
      archive.pipe(res);
    } catch (e: unknown) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (e instanceof HttpException) {
        res.status(e.getStatus()).json(e.getResponse());
        return;
      }
      const message = e instanceof Error ? e.message : "Document export failed";
      res.status(500).json({ message });
    }
  }

  @Get(":table")
  @ApiOperation({ summary: "Paginated rows for an allowlisted table" })
  @ApiOkResponse()
  list(@CurrentUser() user: JwtUser, @Param("table") table: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.explorer.list(user, table, page, pageSize);
  }

  @Get(":table/:id")
  @ApiOperation({ summary: "Single row by id" })
  @ApiOkResponse()
  getOne(@CurrentUser() user: JwtUser, @Param("table") table: string, @Param("id") id: string) {
    return this.explorer.getOne(user, table, id);
  }

  @Post(":table")
  @ApiOperation({ summary: "Create row (tables that support create only)" })
  @ApiOkResponse()
  create(@CurrentUser() user: JwtUser, @Param("table") table: string, @Body() body: Record<string, unknown>) {
    return this.explorer.create(user, table, body ?? {});
  }

  @Patch(":table/:id")
  @ApiOperation({ summary: "Partial update for allowlisted fields" })
  @ApiOkResponse()
  patch(@CurrentUser() user: JwtUser, @Param("table") table: string, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return this.explorer.patch(user, table, id, body ?? {});
  }

  @Delete(":table/:id")
  @ApiOperation({ summary: "Delete row (tables that support delete only)" })
  @ApiOkResponse()
  remove(@CurrentUser() user: JwtUser, @Param("table") table: string, @Param("id") id: string) {
    return this.explorer.remove(user, table, id);
  }
}
