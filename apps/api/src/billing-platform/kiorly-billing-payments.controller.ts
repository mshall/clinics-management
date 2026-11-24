import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { JwtUser } from "../auth/jwt-user";
import { requireTenantId } from "../auth/require-tenant";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";
import { KiorlyPaymentMethodsService } from "./kiorly-payment-methods.service";
import { KiorlyPaymentService, type PayInvoiceMethod } from "./kiorly-payment.service";
import { assertNoPanOrCvvInBody } from "./kiorly-payment-no-pan";
import { KiorlyBillingPaymentsCardSessionBodyDto, KiorlyBillingPaymentsPayBodyDto } from "./kiorly-billing-payments.controller.dto";

const PROOF_LIMIT = 8 * 1024 * 1024;
const PROOF_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

@ApiTags("billing")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("billing")
export class KiorlyBillingPaymentsController {
  constructor(
    private readonly payments: KiorlyPaymentService,
    private readonly paymentMethods: KiorlyPaymentMethodsService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  @Post("payment-methods/card-session")
  @ApiOperation({ summary: "Start hosted card tokenization session (Paymob iframe — no PAN on Kiorly API)" })
  cardSession(@CurrentUser() user: JwtUser, @Body() body: KiorlyBillingPaymentsCardSessionBodyDto) {
    return this.paymentMethods.createCardSession(user, requireTenantId(user), body);
  }

  @Get("payment-methods")
  @ApiOperation({ summary: "List saved Kiorly billing payment methods (token refs only)" })
  listMethods(@CurrentUser() user: JwtUser) {
    return this.paymentMethods.listForTenant(requireTenantId(user));
  }

  @Post("payments/proof")
  @ApiOperation({ summary: "Upload InstaPay/bank transfer proof (returns proofUploadKey)" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: PROOF_LIMIT },
    }),
  )
  async uploadProof(@CurrentUser() user: JwtUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException("file required");
    if (!PROOF_MIME.has(file.mimetype)) throw new BadRequestException("Proof must be PDF or image");
    const tenantId = requireTenantId(user);
    const relativePath = `${tenantId}/${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, "_")}`;
    await this.uploads.put("kiorly-payments", relativePath, file.buffer, file.mimetype);
    return { proofUploadKey: `kiorly-payments/${relativePath}` };
  }

  @Post("invoices/:id/pay")
  @ApiOperation({ summary: "Pay a Kiorly invoice (card token, Fawry, InstaPay, bank)" })
  pay(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body()
    body: KiorlyBillingPaymentsPayBodyDto,
  ) {
    assertNoPanOrCvvInBody(body);
    return this.payments.payInvoice(requireTenantId(user), id, body);
  }

  @Get("payments/:id/status")
  @ApiOperation({ summary: "Poll Kiorly payment status" })
  paymentStatus(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.payments.getPaymentStatus(requireTenantId(user), id);
  }
}