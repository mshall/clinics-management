import type { PixelCrop } from "react-image-crop";

/**
 * react-image-crop reports pixelCrop in CSS pixels relative to the displayed
 * <img> size; drawImage needs coordinates in the image's natural resolution.
 */
export async function getCroppedImageFile(
  imageElement: HTMLImageElement,
  pixelCrop: PixelCrop,
  fileName: string,
  mimeType = "image/jpeg",
): Promise<File> {
  const { naturalWidth, naturalHeight, width: displayWidth, height: displayHeight } = imageElement;
  if (!naturalWidth || !naturalHeight || !displayWidth || !displayHeight) {
    throw new Error("Image is not loaded");
  }

  const scaleX = naturalWidth / displayWidth;
  const scaleY = naturalHeight / displayHeight;

  const cropX = pixelCrop.x * scaleX;
  const cropY = pixelCrop.y * scaleY;
  const cropWidth = pixelCrop.width * scaleX;
  const cropHeight = pixelCrop.height * scaleY;

  const canvas = document.createElement("canvas");
  const width = Math.max(1, Math.round(cropWidth));
  const height = Math.max(1, Math.round(cropHeight));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imageElement, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);

  const quality = mimeType === "image/jpeg" ? 0.92 : mimeType === "image/webp" ? 0.9 : 1;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
  if (!blob) throw new Error("Failed to encode cropped image");

  const ext =
    mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}${ext}`, { type: mimeType });
}

export function cropMimeTypeForFileName(fileName: string, contentType?: string): string {
  if (contentType?.startsWith("image/")) return contentType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}
