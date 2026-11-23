import pica from "pica";

const picaInstance = pica();

export type ImageEnhanceProfile = "document" | "camera" | "avatar" | "general";

type ProfileLimits = {
  maxLongEdge: number;
  unsharpAmount: number;
  unsharpRadius: number;
};

/** Avatar/logo only — clinical document/camera/general send originals unchanged (server quality pipeline). */
const PROFILES: Record<"avatar", ProfileLimits> = {
  avatar: { maxLongEdge: 1280, unsharpAmount: 100, unsharpRadius: 0.6 },
};

const JPEG_QUALITY = 0.8;
/** HEIC fallback when server cannot decode — full resolution, high quality. */
const HEIC_FALLBACK_QUALITY = 0.95;

/** Hard cap aligned with API MAX_UPLOAD_BYTES (25 MB). */
export const CLIENT_UPLOAD_HARD_CAP_BYTES = 25 * 1024 * 1024;

const FAST_SKIP_MAX_BYTES_AVATAR = 600_000;

export function isEnhanceableImage(file: File): boolean {
  if (!file.type.startsWith("image/")) return false;
  return file.type !== "image/gif" && file.type !== "image/svg+xml";
}

function isHeicFile(file: File): boolean {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  return t.includes("heic") || t.includes("heif") || n.endsWith(".heic") || n.endsWith(".heif");
}

/** Clinical profiles: never resize/re-encode in the browser (except HEIC fallback / over hard-cap). */
export function shouldPassThroughOriginal(profile: ImageEnhanceProfile): boolean {
  return profile === "document" || profile === "camera" || profile === "general";
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

function drawToCanvas(img: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

async function convertHeicToJpegFullRes(file: File): Promise<File> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      return await canvasToFile(canvas, outputName(file.name, "image/jpeg"), "image/jpeg", HEIC_FALLBACK_QUALITY);
    }
  } catch {
    /* fall through */
  }
  return file;
}

/** Shrink only when over the hard API cap (emergency client fallback). */
async function shrinkUnderHardCap(file: File): Promise<File> {
  if (file.size <= CLIENT_UPLOAD_HARD_CAP_BYTES) return file;
  try {
    const img = await loadImageFromFile(file);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;
    let scale = 0.85;
    let out = file;
    for (let i = 0; i < 8; i++) {
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas = drawToCanvas(img, tw, th);
      out = await canvasToFile(canvas, outputName(file.name, "image/jpeg"), "image/jpeg", 0.88);
      if (out.size <= CLIENT_UPLOAD_HARD_CAP_BYTES) return out;
      scale *= 0.85;
    }
    return out;
  } catch {
    return file;
  }
}

export async function enhanceImageFile(
  file: File,
  profile: ImageEnhanceProfile = "document",
): Promise<File> {
  if (!isEnhanceableImage(file)) return file;

  if (shouldPassThroughOriginal(profile)) {
    let next = file;
    if (isHeicFile(file)) {
      next = await convertHeicToJpegFullRes(file);
    }
    if (next.size > CLIENT_UPLOAD_HARD_CAP_BYTES) {
      next = await shrinkUnderHardCap(next);
    }
    return next;
  }

  // Avatar / logo path only
  if (file.size > 0 && file.size <= FAST_SKIP_MAX_BYTES_AVATAR) return file;

  try {
    const img = await loadImageFromFile(file);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!naturalWidth || !naturalHeight) return file;

    const { maxLongEdge, unsharpAmount, unsharpRadius } = PROFILES.avatar;
    const { width, height, resize } = computeTargetSize(naturalWidth, naturalHeight, maxLongEdge);
    if (!resize) return file;

    const preservePng = file.type === "image/png";
    const mime = preservePng ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const quality = mime === "image/jpeg" ? JPEG_QUALITY : mime === "image/webp" ? 0.88 : 1;

    const from = drawToCanvas(img, naturalWidth, naturalHeight);
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

/** Camera capture: mark filename; do not downscale (server pipeline). */
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
