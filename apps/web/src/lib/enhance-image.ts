import pica from "pica";

const picaInstance = pica();

export type ImageEnhanceProfile = "document" | "camera" | "avatar" | "general";

type ProfileLimits = {
  maxLongEdge: number;
  unsharpAmount: number;
  unsharpRadius: number;
};

const PROFILES: Record<ImageEnhanceProfile, ProfileLimits> = {
  /** Clinical uploads — aggressive downscale for snappy multi-file uploads. */
  document: { maxLongEdge: 1600, unsharpAmount: 60, unsharpRadius: 0.5 },
  camera: { maxLongEdge: 2400, unsharpAmount: 90, unsharpRadius: 0.6 },
  avatar: { maxLongEdge: 1280, unsharpAmount: 100, unsharpRadius: 0.6 },
  general: { maxLongEdge: 1800, unsharpAmount: 70, unsharpRadius: 0.55 },
};

const JPEG_QUALITY = 0.8;

/** Skip client-side resize when the file is already small (speeds uploads). */
const FAST_SKIP_MAX_BYTES: Record<ImageEnhanceProfile, number> = {
  document: 2_000_000,
  camera: 2_400_000,
  avatar: 600_000,
  general: 1_800_000,
};

export function isEnhanceableImage(file: File): boolean {
  if (!file.type.startsWith("image/")) return false;
  return file.type !== "image/gif" && file.type !== "image/svg+xml";
}

function shouldSkipEnhancement(file: File, profile: ImageEnhanceProfile): boolean {
  if (!isEnhanceableImage(file)) return true;
  if (profile === "document") {
    if (file.name.startsWith("document-capture-")) return true;
    if (file.name.startsWith("prescription-generated-")) return true;
  }
  return false;
}

function computeTargetSize(
  width: number,
  height: number,
  maxLongEdge: number,
): { width: number; height: number; resize: boolean } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height, resize: false };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resize: true,
  };
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

function drawToCanvas(img: HTMLImageElement, width: number, height: number, profile: ImageEnhanceProfile): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  if (profile === "camera" || profile === "document") {
    ctx.filter = "contrast(1.04) brightness(1.02)";
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  ctx.filter = "none";
  return canvas;
}

export async function enhanceImageFile(
  file: File,
  profile: ImageEnhanceProfile = "document",
): Promise<File> {
  if (shouldSkipEnhancement(file, profile)) return file;
  if (file.size > 0 && file.size <= FAST_SKIP_MAX_BYTES[profile]) return file;

  try {
    const img = await loadImageFromFile(file);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return file;

    const { maxLongEdge, unsharpAmount, unsharpRadius } = PROFILES[profile];
    const { width, height, resize } = computeTargetSize(naturalWidth, naturalHeight, maxLongEdge);
    if (!resize) return file;

    const scale = Math.min(width / naturalWidth, height / naturalHeight);
    const preservePng = file.type === "image/png";
    const mime = preservePng ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const quality = mime === "image/jpeg" ? JPEG_QUALITY : mime === "image/webp" ? 0.88 : 1;

    // Prefer canvas over pica for most clinical downscales (much faster on multi-upload).
    if (scale >= 0.35 || profile === "document") {
      const canvas = drawToCanvas(img, width, height, profile);
      return await canvasToFile(canvas, outputName(file.name, mime), mime, quality);
    }

    const from = drawToCanvas(img, naturalWidth, naturalHeight, profile);
    const to = document.createElement("canvas");
    to.width = width;
    to.height = height;

    await picaInstance.resize(from, to, {
      unsharpAmount,
      unsharpRadius,
      unsharpThreshold: 1,
    });

    return await canvasToFile(to, outputName(file.name, mime), mime, quality);
  } catch {
    return file;
  }
}

/** Sharpen camera capture; marks filename so upload won't re-process. */
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
  const enhanced = new FormData();
  const fileJobs = entries.map(async ([key, value]) => {
    if (value instanceof File && isEnhanceableImage(value)) {
      const next = await enhanceImageFile(value, profile);
      return { key, value: next, changed: next !== value, isFile: true as const };
    }
    return { key, value, changed: false, isFile: false as const };
  });
  const results = await Promise.all(fileJobs);
  let changed = false;
  for (const row of results) {
    if (row.isFile && row.changed) changed = true;
    if (row.value instanceof File) {
      enhanced.append(row.key, row.value, row.value.name);
    } else {
      enhanced.append(row.key, row.value);
    }
  }
  return changed ? enhanced : formData;
}
