import type { PixelCrop } from "react-image-crop";

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

export async function getCroppedImageFile(
  imageSrc: string,
  pixelCrop: PixelCrop,
  fileName: string,
  mimeType = "image/jpeg",
): Promise<File> {
  const image = await loadImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  const width = Math.max(1, Math.round(pixelCrop.width));
  const height = Math.max(1, Math.round(pixelCrop.height));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height,
  );

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
