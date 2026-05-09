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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import { ExpenseStatus } from "@prisma/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsEnum } from "class-validator";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { ExpenseDto } from "./dto/expense.dto";
import { ExpensesService } from "./expenses.service";

const PROOF_UPLOAD_LIMIT = 15 * 1024 * 1024;

class PatchExpenseStatusDto {
  @ApiProperty({ enum: ExpenseStatus })
  @IsEnum(ExpenseStatus)
  status!: ExpenseStatus;
}

@ApiTags("expenses")
@ApiBearerAuth("bearer")
@Controller("expenses")
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: "List expenses" })
  @ApiOkResponse({ description: "{ items, total, page, pageSize, totalPages }" })
  list(
    @CurrentUser() user: JwtUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("clinicId") clinicId?: string
  ) {
    return this.expenses.list(user.tenantId, user, from, to, page, pageSize, sortBy, sortOrder, clinicId);
  }

  @Get(":id/proof")
  @ApiOperation({ summary: "Download payment proof attachment (if any)" })
  @ApiOkResponse({ description: "Binary file stream" })
  async getProof(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string
  ): Promise<StreamableFile> {
    const meta = await this.expenses.getProofFileMeta(user.tenantId, id, user);
    const stream = this.expenses.getProofReadStream(meta.absolutePath);
    return new StreamableFile(stream, {
      type: meta.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(meta.originalFileName)}`,
    });
  }

  @Post()
  @ApiOperation({ summary: "Record an expense (multipart: text fields + optional proof file)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["clinicId", "category", "amount", "currency", "incurredAt"],
      properties: {
        clinicId: { type: "string" },
        category: { type: "string" },
        vendorName: { type: "string" },
        amount: { type: "number" },
        currency: { type: "string" },
        incurredAt: { type: "string", format: "date-time" },
        status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
        proof: { type: "string", format: "binary", description: "Receipt / invoice (PDF or image, max 15MB)" },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("proof", {
      storage: memoryStorage(),
      limits: { fileSize: PROOF_UPLOAD_LIMIT },
    })
  )
  @ApiCreatedResponse({ type: ExpenseDto })
  create(
    @CurrentUser() user: JwtUser,
    @Body() body: CreateExpenseDto,
    @UploadedFile() proof?: Express.Multer.File
  ) {
    return this.expenses.create(user.tenantId, body, user, proof);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Approve or reject expense" })
  @ApiOkResponse({ type: ExpenseDto })
  patchStatus(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() body: PatchExpenseStatusDto) {
    return this.expenses.updateStatus(user.tenantId, id, body.status, user);
  }
}
