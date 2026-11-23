import sharp from "sharp";

/** Downscaled luma SSIM (window-free simplified SSIM on 256px long edge) — under 2s for large photos. */
export async function ssimLuma(original: Buffer, candidate: Buffer): Promise<number> {
  const edge = 256;
  const [a, b] = await Promise.all([
    sharp(original, { failOn: "none" }).rotate().resize({ width: edge, height: edge, fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true }),
    sharp(candidate, { failOn: "none" }).rotate().resize({ width: edge, height: edge, fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const w = Math.min(a.info.width, b.info.width);
  const h = Math.min(a.info.height, b.info.height);
  const n = w * h;
  if (n <= 0) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      sumA += a.data[y * a.info.width + x]!;
      sumB += b.data[y * b.info.width + x]!;
    }
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pa = a.data[y * a.info.width + x]! - meanA;
      const pb = b.data[y * b.info.width + x]! - meanB;
      varA += pa * pa;
      varB += pb * pb;
      cov += pa * pb;
    }
  }
  varA /= n - 1;
  varB /= n - 1;
  cov /= n - 1;
  const L = 255;
  const c1 = (0.01 * L) ** 2;
  const c2 = (0.03 * L) ** 2;
  const num = (2 * meanA * meanB + c1) * (2 * cov + c2);
  const den = (meanA * meanA + meanB * meanB + c1) * (varA + varB + c2);
  return den === 0 ? 1 : Math.max(0, Math.min(1, num / den));
}
