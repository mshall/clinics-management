import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { OrgBackupService } from "./org-backup.service";
import { streamOrgBackupArtifact } from "./org-backup-stream";

/**
 * Public (token-gated) download for organization backup artifacts.
 * Path is intentionally outside `admin/data-explorer/:table/:id` so it is not
 * captured by the data-explorer parameterized routes (which require JWT).
 */
@ApiTags("admin-data-explorer")
@Controller("admin/org-backup")
export class OrgBackupDownloadController {
  constructor(private readonly orgBackup: OrgBackupService) {}

  @Get("download")
  @ApiOperation({ summary: "Download READY organization export via expiring token (no JWT)" })
  @ApiOkResponse({ description: "Streams the export artifact" })
  async downloadByToken(
    @Query("token") token: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const file = await this.orgBackup.downloadByToken(token ?? "");
    // Disable request timeouts for long ZIP transfers (Nest/Express defaults can cut mid-stream).
    req.setTimeout?.(0);
    res.setTimeout?.(0);
    await streamOrgBackupArtifact(res, file, req);
  }
}
