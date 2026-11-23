import { BadRequestException } from "@nestjs/common";

/** Hard upload cap (images/PDFs). PROPOSAL raised from 15 MB → 25 MB for clinical originals. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Per-kind caps (PROPOSAL). Falls back to MAX_UPLOAD_BYTES. */
export const UPLOAD_MAX_BYTES_BY_KIND: Record<string, number> = {
  image: 25 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  default: MAX_UPLOAD_BYTES,
};

export function maxUploadBytesForMime(mime: string): number {
  if (mime.startsWith("image/")) return UPLOAD_MAX_BYTES_BY_KIND.image ?? MAX_UPLOAD_BYTES;
  if (mime.includes("pdf")) return UPLOAD_MAX_BYTES_BY_KIND.pdf ?? MAX_UPLOAD_BYTES;
  return UPLOAD_MAX_BYTES_BY_KIND.default ?? MAX_UPLOAD_BYTES;
}

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