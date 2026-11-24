import { Body, Controller, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { KiorexImportService, type ImportRecordsBody } from "./kiorex-import.service";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";
import { MarketplaceClient } from "./marketplace-client.decorator";
import type { PlatformIntegrationClientService } from "./platform-integration-client.service";
import { KiorexImportRollbackBodyDto } from "./kiorex-import.controller.dto";

type Principal = Awaited<ReturnType<PlatformIntegrationClientService["authenticate"]>>;

/** DRAFT contract (kiorex-contracts docs/ORG_IMPORT.md): HMAC-signed, needs the ONBOARDING_IMPORT scope on the integration client. */
@ApiTags("marketplace")
@Controller("marketplace/v1/imports")
@UseGuards(MarketplaceAuthGuard)
@ApiHeader({ name: "X-Kiorly-Client-Key", required: true })
@ApiHeader({ name: "X-Kiorly-Client-Secret", required: true })
@ApiHeader({ name: "X-Kiorly-Timestamp", required: true })
@ApiHeader({ name: "X-Kiorly-Nonce", required: true })
@ApiHeader({ name: "X-Kiorly-Signature", required: true })
export class KiorexImportController {
  constructor(private readonly imports: KiorexImportService) {}

  @Post(":batchId/records")
  @HttpCode(200)
  @ApiOperation({ summary: "DRAFT: idempotent, chunk-atomic import of one entity into the organization provisioned for orgId" })
  records(@MarketplaceClient() client: Principal, @Param("batchId") batchId: string, @Body() body: ImportRecordsBody) {
    return this.imports.importRecords(client, batchId, body);
  }

  @Post(":batchId/rollback")
  @HttpCode(200)
  @ApiOperation({ summary: "DRAFT: remove everything a batch created (rows and stored files)" })
  rollback(@MarketplaceClient() client: Principal, @Param("batchId") batchId: string, @Body() body: KiorexImportRollbackBodyDto) {
    return this.imports.rollback(client, batchId, body);
  }
}
