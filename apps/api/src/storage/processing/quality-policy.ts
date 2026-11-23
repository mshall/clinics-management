/**
 * Storage quality policy — every knob is env-configurable (PROPOSAL defaults).
 * Files at or under STORAGE_QUALITY_THRESHOLD_BYTES are KEEP (pixel-identical path).
 */

export type QualityAction = "KEEP" | "REDUCE";

export type QualityPolicyConfig = {
  thresholdBytes: number;
  jpegQualityStart: number;
  jpegQualityFloor: number;
  minLongEdgePx: number;
  ssimMin: number;
  pdfImageDpiFloor: number;
  pdfJpegQualityFloor: number;
  stripLocationMetadata: boolean;
  hardCapBytes: number;
  shadowModeDays: number;
};

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim()?.toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return fallback;
}

/** PROPOSAL defaults — NEEDS_HUMAN confirm 4 MB threshold and floors. */
export function loadQualityPolicyConfig(): QualityPolicyConfig {
  return {
    thresholdBytes: intEnv("STORAGE_QUALITY_THRESHOLD_BYTES", 4_194_304),
    jpegQualityStart: intEnv("STORAGE_JPEG_QUALITY_START", 95),
    jpegQualityFloor: intEnv("STORAGE_JPEG_QUALITY_FLOOR", 80),
    minLongEdgePx: intEnv("STORAGE_MIN_LONG_EDGE_PX", 3000),
    ssimMin: Number.parseFloat(process.env.STORAGE_SSIM_MIN ?? "0.985") || 0.985,
    pdfImageDpiFloor: intEnv("STORAGE_PDF_IMAGE_DPI_FLOOR", 300),
    pdfJpegQualityFloor: intEnv("STORAGE_PDF_JPEG_QUALITY_FLOOR", 85),
    stripLocationMetadata: boolEnv("STORAGE_STRIP_LOCATION_METADATA", true),
    hardCapBytes: intEnv("UPLOAD_MAX_BYTES", 25 * 1024 * 1024),
    shadowModeDays: intEnv("STORAGE_QUALITY_SHADOW_DAYS", 14),
  };
}

export type DecideInput = {
  sizeBytes: number;
  mimeType?: string;
};

export type DecideResult = {
  action: QualityAction;
  reason: string;
};

/** Pure: at or under threshold → KEEP; above → REDUCE. */
export function decide(file: DecideInput, cfg: QualityPolicyConfig = loadQualityPolicyConfig()): DecideResult {
  if (file.sizeBytes <= cfg.thresholdBytes) {
    return { action: "KEEP", reason: "at_or_under_threshold" };
  }
  return { action: "REDUCE", reason: "over_threshold" };
}

/**
 * Feature switch: env STORAGE_QUALITY_PIPELINE overrides;
 * else tenant override; else on for local/test, off for AWS/production.
 */
export function resolveStorageQualityEnabled(opts: {
  env?: string | null;
  nodeEnv?: string | null;
  deployTarget?: string | null;
  tenantEnabled?: boolean | null;
}): boolean {
  const env = opts.env?.trim()?.toLowerCase();
  if (env === "0" || env === "false" || env === "off") return false;
  if (env === "1" || env === "true" || env === "on") return true;
  if (opts.tenantEnabled === true) return true;
  if (opts.tenantEnabled === false) return false;
  if ((opts.deployTarget ?? "").toLowerCase() === "aws") return false;
  if ((opts.nodeEnv ?? "").toLowerCase() === "production") return false;
  return true;
}

export type QualityNote = "ORIGINAL_KEPT" | "LOSSLESS" | "REDUCED" | "FLOOR_REACHED";
