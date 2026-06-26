import pica from "pica";

const picaInstance = pica();

export type ImageEnhanceProfile = "document" | "camera" | "avatar" | "general";

const PROFILES: Record<
  ImageEnhanceProfile,
  { minLongEdge: number; maxLongEdge: number; unsharpAmount: number; unsharpRadius: number }
> = {
  document: { minLongEdge: 2800, maxLongEdge: 4096, unsharpAmount: 140, unsharpRadius: 0.8 },
  camera: { minLongEdge: 3200, maxLongEdge: 4096, unsharpAmount: 180, unsharpRadius: 0.85 },
  avatar: { minLongEdge: 768, maxLongEdge: 1280, unsharpAmount: 100, unsharpRadius: 0.6 },
  general: { minLongEdge: 2000, maxLongEdge: 3200, unsharpAmount: 120, unsharpRadius: 0.75 },
};

const JPEG_QUALITY = 0.96;

export function isEnhanceableImage(file: File): boolean {
  if (!file.type.startsWith("image/")) return false;
  return file.type !== "image/gif" && file.type !== "image/svg+xml";
}

function computeTargetSize(
  width: number,
  height: number,
  limits: { minLongEdge: number; maxLongEdge: number },
): { width: number; height: number } {
  const { minLongEdge, maxLongEdge } = limits;
  const longEdge = Math.max(width, height);
  let scale = 1;

  if (longEdge < minLongEdge) {
    scale = minLongEdge / longEdge;
  } else if (longEdge > maxLongEdge) {
    scale = maxLongEdge / longEdge;
  }

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  return { width: targetWidth, height: targetHeight };
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
  if (profile === "document" && file.name.startsWith("document-capture-")) return file;

  try {
    const img = await loadImageFromFile(file);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return file;

    const { minLongEdge, maxLongEdge, unsharpAmount, unsharpRadius } = PROFILES[profile];
    const { width, height } = computeTargetSize(naturalWidth, naturalHeight, {
      minLongEdge,
      maxLongEdge,
    });

    const from = document.createElement("canvas");
    from.width = naturalWidth;
    from.height = naturalHeight;
    const fromCtx = from.getContext("2d");
    if (!fromCtx) return file;

    if (profile === "camera" || profile === "document") {
      fromCtx.filter = "contrast(1.06) brightness(1.03)";
    }
    fromCtx.drawImage(img, 0, 0);
    fromCtx.filter = "none";

    const to = document.createElement("canvas");
    to.width = width;
    to.height = height;

    await picaInstance.resize(from, to, {
      unsharpAmount,
      unsharpRadius,
      unsharpThreshold: 1,
    });

    const preservePng = file.type === "image/png";
    const mime = preservePng ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const quality = mime === "image/jpeg" ? JPEG_QUALITY : mime === "image/webp" ? 0.92 : 1;

    return await canvasToFile(to, outputName(file.name, mime), mime, quality);
  } catch {
    return file;
  }
}

/** Sharpen and upscale a camera capture; marks filename so upload won't re-process. */
export async function enhanceCameraCaptureFile(file: File): Promise<File> {
  const enhanced = await enhanceImageFile(file, "camera");
  const mime = enhanced.type || "image/jpeg";
  const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  return new File([enhanced], `document-capture-${Date.now()}${ext}`, { type: mime });
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
