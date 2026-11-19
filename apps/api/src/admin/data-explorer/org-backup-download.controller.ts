import { Controller, Get, Query, Res } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { OrgBackupService } from "./org-backup.service";

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
  async downloadByToken(@Query("token") token: string | undefined, @Res() res: Response) {
    const file = await this.orgBackup.downloadByToken(token ?? "");
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
}
