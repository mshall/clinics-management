import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { decide, loadQualityPolicyConfig } from "./quality-policy";
import { processImage, stripJpegGpsLossless } from "./image-processor";
import { bytesSha256, rasterSha256 } from "./raster-hash";

const cfg = loadQualityPolicyConfig();

describe("image KEEP / REDUCE boundaries", () => {
  it("regression: ≤4 MB path does not re-encode pixels", async () => {
    const small = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    assert.ok(small.length <= cfg.thresholdBytes);
    assert.equal(decide({ sizeBytes: small.length }, cfg).action, "KEEP");
    const out = await processImage(small, "image/jpeg", cfg);
    assert.equal(out.qualityNote, "ORIGINAL_KEPT");
    assert.equal(await rasterSha256(small), await rasterSha256(out.body));
    assert.ok(out.thumbs.small.length > 0);
    assert.ok(out.thumbs.large.length > 0);
  });

  it("KEEP at padded exact threshold bytes (policy)", () => {
    assert.equal(decide({ sizeBytes: 4_194_304 }, cfg).action, "KEEP");
    assert.equal(decide({ sizeBytes: 4_194_305 }, cfg).action, "REDUCE");
  });

  it("stripJpegGpsLossless is no-op without GPS (byte-identical)", async () => {
    const jpg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    assert.equal(stripJpegGpsLossless(jpg), null);
  });

  it("REDUCE over-threshold photo lands ≤ threshold or FLOOR_REACHED with SSIM floor", async () => {
    // Large synthetic photo (~6–14 MB range depending on sharp)
    let big = await sharp({
      create: { width: 5000, height: 4000, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg({ quality: 98, mozjpeg: true })
      .toBuffer();
    if (big.length <= cfg.thresholdBytes) {
      big = await sharp({
        create: { width: 6000, height: 5000, channels: 3, background: { r: 180, g: 90, b: 40 } },
      })
        .jpeg({ quality: 100, mozjpeg: true })
        .toBuffer();
    }
    if (big.length <= cfg.thresholdBytes) {
      // Environment produced a small buffer — skip soft assert
      return;
    }
    const out = await processImage(big, "image/jpeg", cfg);
    assert.ok(["LOSSLESS", "REDUCED", "FLOOR_REACHED"].includes(out.qualityNote));
    if (out.qualityNote !== "FLOOR_REACHED") {
      assert.ok(out.body.length <= cfg.thresholdBytes, `expected ≤4MB got ${out.body.length}`);
    }
    if (out.ssim != null) assert.ok(out.ssim >= cfg.ssimMin - 0.001);
    assert.ok(out.thumbs.small.length > 0);
    assert.notEqual(bytesSha256(out.body), bytesSha256(Buffer.from("exe")));
  });

  it("corrupted / non-image bytes renamed jpg → SKIPPED or ORIGINAL keep without crash", async () => {
    const fake = Buffer.from("MZ\x90\x00this-is-not-a-jpeg-or-exe-payload");
    const out = await processImage(fake, "image/jpeg", { ...cfg, stripLocationMetadata: false });
    assert.ok(out.body.length === fake.length || out.skipped || out.qualityNote === "ORIGINAL_KEPT");
  });
});
