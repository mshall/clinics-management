import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { JwtUser } from "../auth/jwt-user";
import { ClinicianVerificationService } from "./clinician-verification.service";
import { SubmitClinicianVerificationDto } from "./dto/submit-clinician-verification.dto";
import type { VerificationDocumentKind } from "./verification-documents";

const UPLOAD_LIMIT = 15 * 1024 * 1024;

@ApiTags("clinicians")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("clinicians/me/verification")
export class ClinicianVerificationController {
  constructor(private readonly service: ClinicianVerificationService) {}

  @Get()
  getMine(@CurrentUser() user: JwtUser) {
    return this.service.getMine(user);
  }

  @Post()
  submit(@CurrentUser() user: JwtUser, @Body() body: SubmitClinicianVerificationDto) {
    return this.service.upsertMine(user, body);
  }

  @Post("documents/:kind")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_LIMIT },
    }),
  )
  uploadDocument(
    @CurrentUser() user: JwtUser,
    @Param("kind") kind: VerificationDocumentKind,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.attachDocument(user, kind, file);
  }

  @Get("documents/:kind/file")
  async downloadOwn(@CurrentUser() user: JwtUser, @Param("kind") kind: VerificationDocumentKind): Promise<StreamableFile> {
    return this.service.streamDocument(user, user.userId, kind);
  }
}