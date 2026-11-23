import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as path from "node:path";
import { LocalUploadBlobStorage } from "./local-upload-blob.storage";
import { S3UploadBlobStorage } from "../platform/adapters";
import { UPLOAD_BLOB_STORAGE } from "./upload-blob.storage";
import { DocumentProcessingService } from "./processing/document-processing.service";
import { StorageProcessingWorker } from "./processing/processing.worker";
import { PrismaModule } from "../prisma/prisma.module";

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    {
      provide: UPLOAD_BLOB_STORAGE,
      useFactory: (config: ConfigService) => {
        const driver = (config.get<string>("UPLOAD_STORAGE") ?? "local").toLowerCase();
        if (driver === "s3") {
          const bucket = config.get<string>("S3_UPLOAD_BUCKET");
          if (!bucket?.trim()) {
            throw new Error("S3_UPLOAD_BUCKET is required when UPLOAD_STORAGE=s3");
          }
          const region = config.get<string>("AWS_REGION") ?? config.get<string>("AWS_DEFAULT_REGION") ?? "eu-central-1";
          return new S3UploadBlobStorage(bucket.trim(), region);
        }
        const root = config.get<string>("UPLOAD_LOCAL_ROOT") ?? path.join(process.cwd(), "uploads");
        return new LocalUploadBlobStorage(root);
      },
      inject: [ConfigService],
    },
    DocumentProcessingService,
    StorageProcessingWorker,
  ],
  exports: [UPLOAD_BLOB_STORAGE, DocumentProcessingService],
})
export class StorageModule {}
