import pica from "pica";

const picaInstance = pica();

export type ImageEnhanceProfile = "document" | "avatar" | "general";

const PROFILES: Record<ImageEnhanceProfile, { minLongEdge: number; maxLongEdge: number }> = {
  document: { minLongEdge: 1920, maxLongEdge: 2560 },
  avatar: { minLongEdge: 512, maxLongEdge: 1024 },
  general: { minLongEdge: 1600, maxLongEdge: 2560 },
};

const JPEG_QUALITY = 0.92;

export function isEnhanceableImage(file: File): boolean {
  if (!file.type.startsWith("image/")) return false;
  return file.type !== "image/gif" && file.type !== "image/svg+xml";
}

function computeTargetSize(
  width: number,
  height: number,
  profile: ImageEnhanceProfile,
): { width: number; height: number; needsProcessing: boolean } {
  const { minLongEdge, maxLongEdge } = PROFILES[profile];
  const longEdge = Math.max(width, height);
  let scale = 1;

  if (longEdge < minLongEdge) {
    scale = minLongEdge / longEdge;
  } else if (longEdge > maxLongEdge) {
    scale = maxLongEdge / longEdge;
  }

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const needsProcessing =
    targetWidth !== width || targetHeight !== height || longEdge < minLongEdge;

  return { width: targetWidth, height: targetHeight, needsProcessing };
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  mime: string,
  quality: number,
): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  if (!blob) throw new Error("Failed to encode image");
  return new File([blob], fileName, { type: mime });
}

function outputName(originalName: string, mime: string): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  return `${base}${ext}`;
}

export async function enhanceImageFile(
  file: File,
  profile: ImageEnhanceProfile = "document",
): Promise<File> {
  if (!isEnhanceableImage(file)) return file;

  try {
    const img = await loadImageFromFile(file);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return file;

    const { width, height, needsProcessing } = computeTargetSize(naturalWidth, naturalHeight, profile);
    if (!needsProcessing) return file;

    const from = document.createElement("canvas");
    from.width = naturalWidth;
    from.height = naturalHeight;
    const fromCtx = from.getContext("2d");
    if (!fromCtx) return file;
    fromCtx.drawImage(img, 0, 0);

    const to = document.createElement("canvas");
    to.width = width;
    to.height = height;

    await picaInstance.resize(from, to, {
      unsharpAmount: 80,
      unsharpRadius: 0.6,
      unsharpThreshold: 2,
    });

    const preservePng = file.type === "image/png";
    const mime = preservePng ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const quality = mime === "image/jpeg" ? JPEG_QUALITY : mime === "image/webp" ? 0.9 : 1;

    return await canvasToFile(to, outputName(file.name, mime), mime, quality);
  } catch {
    return file;
  }
}

export async function enhanceImageFiles(
  files: File[],
  profile: ImageEnhanceProfile = "document",
): Promise<File[]> {
  return Promise.all(files.map((file) => enhanceImageFile(file, profile)));
}

export async function enhanceFormDataImages(
  formData: FormData,
  profile: ImageEnhanceProfile = "document",
): Promise<FormData> {
  const entries = [...formData.entries()];
  let changed = false;
  const enhanced = new FormData();

  for (const [key, value] of entries) {
    if (value instanceof File && isEnhanceableImage(value)) {
      const next = await enhanceImageFile(value, profile);
      if (next !== value) changed = true;
      enhanced.append(key, next, next.name);
    } else {
      enhanced.append(key, value);
    }
  }

  return changed ? enhanced : formData;
}
