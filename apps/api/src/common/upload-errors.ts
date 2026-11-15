import { BadRequestException } from "@nestjs/common";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function throwUploadFileRequired(): never {
  throw new BadRequestException({
    message: "A file is required for this upload.",
    messageKey: "errors.upload.fileRequired",
  });
}

export function throwUploadFileTooLarge(maxMb = MAX_UPLOAD_BYTES / (1024 * 1024)): never {
  throw new BadRequestException({
    message: `File too large (max ${maxMb}MB)`,
    messageKey: "errors.upload.fileTooLarge",
    messageParams: { maxMb },
  });
}

export function throwUploadUnsupportedType(mime: string): never {
  throw new BadRequestException({
    message: `Unsupported file type: ${mime}`,
    messageKey: "errors.upload.unsupportedType",
    messageParams: { mime },
  });
}

export function throwUploadDescriptionRequired(): never {
  throw new BadRequestException({
    message: "A description is required for this document.",
    messageKey: "errors.upload.descriptionRequired",
  });
}

export function throwUploadImagesOnly(): never {
  throw new BadRequestException({
    message: "Only image documents can be cropped.",
    messageKey: "errors.upload.imagesOnly",
  });
}

export function assertUploadSizeBytes(size: number, maxBytes = MAX_UPLOAD_BYTES): void {
  if (size > maxBytes) throwUploadFileTooLarge(maxBytes / (1024 * 1024));
}