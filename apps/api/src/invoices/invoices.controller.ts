import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { PatchClinicInvoiceSettingsDto } from "../clinics/dto/patch-clinic-invoice-settings.dto";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { InvoiceDto, InvoiceListItemDto } from "./dto/invoice.dto";
import { InvoicesService } from "./invoices.service";

const LOGO_UPLOAD_LIMIT = 5 * 1024 * 1024;

@ApiTags("invoices")
@ApiBearerAuth("bearer")
@Controller()
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post("invoices")
  @ApiOperation({ summary: "Generate an invoice linked to an encounter or operation" })
  @ApiCreatedResponse({ type: InvoiceDto })
  create(@CurrentUser() user: JwtUser, @Body() body: CreateInvoiceDto) {
    return this.invoices.create(requireTenantId(user), body, user);
  }

  @Get("invoices")
  @ApiOperation({ summary: "List invoices (filter by patientId, encounterId, or operationId)" })
  @ApiOkResponse({ type: InvoiceListItemDto, isArray: true })
  list(
    @CurrentUser() user: JwtUser,
    @Query("patientId") patientId?: string,
    @Query("encounterId") encounterId?: string,
    @Query("operationId") operationId?: string,
  ) {
    return this.invoices.list(requireTenantId(user), user, {
      patientId: patientId?.trim() || undefined,
      encounterId: encounterId?.trim() || undefined,
      operationId: operationId?.trim() || undefined,
    });
  }

  @Get("invoices/:id")
  @ApiOperation({ summary: "Get one invoice with line items" })
  @ApiOkResponse({ type: InvoiceDto })
  getOne(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.invoices.getOne(requireTenantId(user), id, user);
  }

  @Patch("clinics/:clinicId/invoice-settings")
  @ApiOperation({ summary: "Update clinic invoice branding (admin roles)" })
  patchClinicSettings(
    @CurrentUser() user: JwtUser,
    @Param("clinicId") clinicId: string,
    @Body() body: PatchClinicInvoiceSettingsDto,
  ) {
    return this.invoices.patchClinicInvoiceSettings(requireTenantId(user), clinicId, user, body);
  }

  @Post("clinics/:clinicId/invoice-logo")
  @ApiOperation({ summary: "Upload clinic invoice logo (admin roles)" })
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
      storage: memoryStorage(),
      limits: { fileSize: LOGO_UPLOAD_LIMIT },
    }),
  )
  uploadLogo(
    @CurrentUser() user: JwtUser,
    @Param("clinicId") clinicId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.invoices.uploadClinicInvoiceLogo(requireTenantId(user), clinicId, user, file);
  }

  @Get("clinics/:clinicId/invoice-logo")
  @ApiOperation({ summary: "Download clinic invoice logo" })
  @ApiOkResponse({ description: "Binary image stream" })
  async getLogo(@CurrentUser() user: JwtUser, @Param("clinicId") clinicId: string): Promise<StreamableFile> {
    const meta = await this.invoices.getClinicInvoiceLogoMeta(requireTenantId(user), clinicId, user);
    const stream = await this.invoices.openClinicInvoiceLogoReadStream(meta.storageKey);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }
}
