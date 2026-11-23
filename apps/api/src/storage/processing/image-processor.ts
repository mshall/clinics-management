import piexif from "piexifjs";
import sharp from "sharp";
import {
  decide,
  loadQualityPolicyConfig,
  type QualityNote,
  type QualityPolicyConfig,
} from "./quality-policy";
import { bytesSha256, rasterSha256 } from "./raster-hash";
import { ssimLuma } from "./ssim";

export type ImageProcessResult = {
  body: Buffer;
  mimeType: string;
  qualityNote: QualityNote;
  ssim: number | null;
  qualityUsed: number | null;
  longEdgeUsed: number | null;
  width: number | null;
  height: number | null;
  skipped: boolean;
  skipReason?: string;
  thumbs: { small: Buffer; large: Buffer };
};

function isJpeg(mime: string, buf: Buffer): boolean {
  return mime.includes("jpeg") || mime.includes("jpg") || (buf[0] === 0xff && buf[1] === 0xd8);
}

function isPng(mime: string, buf: Buffer): boolean {
  return mime.includes("png") || (buf[0] === 0x89 && buf[1] === 0x50);
}

function isWebp(mime: string): boolean {
  return mime.includes("webp");
}

function isHeic(mime: string): boolean {
  return mime.includes("heic") || mime.includes("heif");
}

/** JPEG: strip GPS IFD only via piexif (no DCT re-encode). Keep orientation. No-op if no GPS. */
export function stripJpegGpsLossless(buf: Buffer): Buffer | null {
  try {
    const dataUri = "data:image/jpeg;base64," + buf.toString("base64");
    const exifObj = piexif.load(dataUri);
    if (!exifObj.GPS || Object.keys(exifObj.GPS).length === 0) {
      return null; // byte-identical keep — do not rewrite EXIF
    }
    delete exifObj.GPS;
    // Keep 0th / Exif including Orientation (274)
    const exifBytes = piexif.dump(exifObj);
    const inserted = piexif.insert(exifBytes, dataUri);
    const b64 = inserted.split(",")[1];
    if (!b64) return null;
    return Buffer.from(b64, "base64");
  } catch {
    return null;
  }
}

async function makeThumbs(buf: Buffer): Promise<{ small: Buffer; large: Buffer }> {
  const [small, large] = await Promise.all([
    sharp(buf, { failOn: "none" }).rotate().resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    sharp(buf, { failOn: "none" }).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
  ]);
  return { small, large };
}

async function meta(buf: Buffer): Promise<{ width: number; height: number; longEdge: number }> {
  const m = await sharp(buf, { failOn: "none" }).metadata();
  const width = m.width ?? 0;
  const height = m.height ?? 0;
  return { width, height, longEdge: Math.max(width, height) };
}

export async function processImage(
  input: Buffer,
  mimeType: string,
  cfg: QualityPolicyConfig = loadQualityPolicyConfig(),
): Promise<ImageProcessResult> {
  if (isHeic(mimeType)) {
    try {
      await sharp(input, { failOn: "none" }).metadata();
    } catch {
      return {
        body: input,
        mimeType,
        qualityNote: "ORIGINAL_KEPT",
        ssim: null,
        qualityUsed: null,
        longEdgeUsed: null,
        width: null,
        height: null,
        skipped: true,
        skipReason: "heic_unsupported",
        thumbs: { small: Buffer.alloc(0), large: Buffer.alloc(0) },
      };
    }
  }

  const decision = decide({ sizeBytes: input.length, mimeType }, cfg);
  let working = input;
  let outMime = mimeType;
  let qualityNote: QualityNote = "ORIGINAL_KEPT";
  let ssim: number | null = null;
  let qualityUsed: number | null = null;
  let longEdgeUsed: number | null = null;

  if (decision.action === "KEEP") {
    if (cfg.stripLocationMetadata && isJpeg(mimeType, input)) {
      const stripped = stripJpegGpsLossless(input);
      if (stripped) {
        const [h0, h1] = await Promise.all([rasterSha256(input), rasterSha256(stripped)]);
        if (h0 === h1) working = stripped;
      }
    } else if (cfg.stripLocationMetadata && (isPng(mimeType, input) || isWebp(mimeType))) {
      // Lossless metadata strip via sharp without re-quantizing when possible — verify raster hash.
      try {
        const stripped = await sharp(input, { failOn: "none" }).withMetadata({ exif: {} }).toBuffer();
        const [h0, h1] = await Promise.all([rasterSha256(input), rasterSha256(stripped)]);
        if (h0 === h1) working = stripped;
      } catch {
        /* keep original */
      }
    }
  } else {
    // REDUCE ladder
    const original = input;
    let best: Buffer = input;
    let bestMime = mimeType;
    let bestNote: QualityNote = "LOSSLESS";
    let bestQ: number | null = null;
    let bestLong: number | null = null;
    let bestSsim: number | null = null;

    // Step 1 — lossless optimise (mozjpeg / png)
    try {
      if (isJpeg(mimeType, input)) {
        const lossless = await sharp(input, { failOn: "none" })
          .withMetadata()
          .jpeg({ quality: 100, mozjpeg: true, trellisQuantisation: true, overshootDeringing: true, optimiseScans: true })
          .toBuffer();
        // Quality 100 still re-encodes — only accept if under threshold AND SSIM high; else skip to step 2
        const s = await ssimLuma(original, lossless);
        if (s >= cfg.ssimMin && lossless.length <= cfg.thresholdBytes) {
          best = lossless;
          bestNote = "LOSSLESS";
          bestSsim = s;
        } else if (s >= cfg.ssimMin && lossless.length < best.length) {
          best = lossless;
          bestNote = "LOSSLESS";
          bestSsim = s;
        }
      } else if (isPng(mimeType, input)) {
        const lossless = await sharp(input, { failOn: "none" }).png({ compressionLevel: 9, palette: false }).toBuffer();
        if (lossless.length <= cfg.thresholdBytes) {
          best = lossless;
          bestNote = "LOSSLESS";
          bestSsim = 1;
        }
      }
    } catch {
      /* continue ladder */
    }

    const pngHasAlpha = isPng(mimeType, original)
      ? Boolean((await sharp(original, { failOn: "none" }).metadata()).hasAlpha)
      : false;
    let pngColorCount: number | null = null;
    if (isPng(mimeType, original) && !pngHasAlpha) {
      try {
        const { data } = await sharp(original, { failOn: "none" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const seen = new Set<string>();
        for (let i = 0; i < data.length; i += 4) {
          seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
          if (seen.size > 256) break;
        }
        pngColorCount = seen.size;
      } catch {
        pngColorCount = null;
      }
    }
    const mayConvertPngToJpeg = isPng(mimeType, original) && !pngHasAlpha && (pngColorCount ?? 0) > 256;
    const encodeAsWebp = isWebp(mimeType);

    if (best.length > cfg.thresholdBytes) {
      // Step 2 — binary search quality at full resolution (JPEG / WebP; PNG→JPEG only when photo-like)
      if (!isPng(mimeType, original) || mayConvertPngToJpeg || encodeAsWebp || isJpeg(mimeType, original)) {
        const startQ = cfg.jpegQualityStart;
        const floorQ = cfg.jpegQualityFloor;
        let lo = floorQ;
        let hi = startQ;
        let chosen: { buf: Buffer; q: number; s: number; mime: string } | null = null;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const pipeline = sharp(original, { failOn: "none" }).rotate().withMetadata();
          const cand = encodeAsWebp
            ? await pipeline.webp({ quality: mid }).toBuffer()
            : await pipeline.jpeg({ quality: mid, mozjpeg: true, progressive: true }).toBuffer();
          const s = await ssimLuma(original, cand);
          if (s >= cfg.ssimMin && cand.length <= cfg.thresholdBytes) {
            chosen = { buf: cand, q: mid, s, mime: encodeAsWebp ? "image/webp" : "image/jpeg" };
            lo = mid + 1;
          } else if (s < cfg.ssimMin) {
            hi = mid - 1;
          } else {
            hi = mid - 1;
          }
        }
        if (chosen) {
          best = chosen.buf;
          bestMime = chosen.mime;
          bestNote = "REDUCED";
          bestQ = chosen.q;
          bestSsim = chosen.s;
        } else {
          const pipeline = sharp(original, { failOn: "none" }).rotate();
          const cand = encodeAsWebp
            ? await pipeline.webp({ quality: floorQ }).toBuffer()
            : await pipeline.jpeg({ quality: floorQ, mozjpeg: true, progressive: true }).toBuffer();
          const s = await ssimLuma(original, cand);
          if (s >= cfg.ssimMin) {
            best = cand;
            bestMime = encodeAsWebp ? "image/webp" : "image/jpeg";
            bestNote = cand.length <= cfg.thresholdBytes ? "REDUCED" : "FLOOR_REACHED";
            bestQ = floorQ;
            bestSsim = s;
          }
        }
      }
    }

    if (best.length > cfg.thresholdBytes) {
      // Step 3 — gentle long-edge reduction, never below minLongEdgePx
      const m = await meta(original);
      let edge = m.longEdge;
      while (edge > cfg.minLongEdgePx && best.length > cfg.thresholdBytes) {
        edge = Math.max(cfg.minLongEdgePx, Math.floor(edge * 0.9));
        const resized = sharp(original, { failOn: "none" })
          .rotate()
          .resize({
            width: m.width >= m.height ? edge : undefined,
            height: m.height > m.width ? edge : undefined,
            fit: "inside",
            withoutEnlargement: true,
            kernel: sharp.kernel.lanczos3,
          });
        const cand =
          isPng(mimeType, original) && (pngHasAlpha || !mayConvertPngToJpeg)
            ? await resized.png({ compressionLevel: 9 }).toBuffer()
            : encodeAsWebp
              ? await resized.webp({ quality: 90 }).toBuffer()
              : await resized.jpeg({ quality: 90, mozjpeg: true, progressive: true }).toBuffer();
        const s = await ssimLuma(original, cand);
        if (s < cfg.ssimMin) break;
        best = cand;
        bestMime =
          isPng(mimeType, original) && (pngHasAlpha || !mayConvertPngToJpeg)
            ? "image/png"
            : encodeAsWebp
              ? "image/webp"
              : "image/jpeg";
        bestQ = 90;
        bestLong = edge;
        bestSsim = s;
        bestNote = cand.length <= cfg.thresholdBytes ? "REDUCED" : "FLOOR_REACHED";
        if (cand.length <= cfg.thresholdBytes) break;
      }
      if (best.length > cfg.thresholdBytes) bestNote = "FLOOR_REACHED";
    }

    working = best;
    outMime = bestMime;
    qualityNote = bestNote;
    qualityUsed = bestQ;
    longEdgeUsed = bestLong;
    ssim = bestSsim;
  }

  const dims = await meta(working).catch(() => ({ width: 0, height: 0, longEdge: 0 }));
  let thumbs: { small: Buffer; large: Buffer };
  try {
    thumbs = await makeThumbs(working);
  } catch {
    thumbs = { small: Buffer.alloc(0), large: Buffer.alloc(0) };
  }

  return {
    body: working,
    mimeType: outMime,
    qualityNote,
    ssim,
    qualityUsed,
    longEdgeUsed: longEdgeUsed ?? (dims.longEdge || null),
    width: dims.width || null,
    height: dims.height || null,
    skipped: false,
    thumbs,
  };
}

export { bytesSha256 };
