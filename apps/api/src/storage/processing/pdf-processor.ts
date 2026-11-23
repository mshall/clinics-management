import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, loadQualityPolicyConfig, type QualityNote, type QualityPolicyConfig } from "./quality-policy";

export type PdfProcessResult = {
  body: Buffer;
  qualityNote: QualityNote;
  pageCount: number | null;
  skipped: boolean;
  skipReason?: string;
  rejected?: boolean;
  rejectReason?: string;
};

function hasPdfJavascriptOrEmbedded(buf: Buffer): boolean {
  const s = buf.toString("latin1");
  if (/\/JavaScript\b/i.test(s) || /\/JS\b/.test(s)) return true;
  if (/\/EmbeddedFiles\b/i.test(s)) return true;
  return false;
}

function runCmd(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: -1, stderr: "timeout" });
    }, timeoutMs);
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8").slice(0, 500);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, stderr });
    });
    child.on("error", () => {
      clearTimeout(t);
      resolve({ code: 127, stderr: "spawn_failed" });
    });
  });
}

async function qpdfOptimize(input: Buffer): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), "kx-pdf-"));
  const inPath = join(dir, "in.pdf");
  const outPath = join(dir, "out.pdf");
  try {
    await writeFile(inPath, input);
    const { code } = await runCmd(
      "qpdf",
      ["--linearize", "--object-streams=generate", "--recompress-flate", "--compression-level=9", inPath, outPath],
      60_000,
    );
    if (code !== 0) return null;
    return await readFile(outPath);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function ghostscriptPrinter(input: Buffer, cfg: QualityPolicyConfig): Promise<Buffer | null> {
  const lossyFlag = (process.env.STORAGE_PDF_LOSSY ?? "1").trim();
  if (lossyFlag === "0" || lossyFlag === "false") return null;
  const dir = await mkdtemp(join(tmpdir(), "kx-gs-"));
  const inPath = join(dir, "in.pdf");
  const outPath = join(dir, "out.pdf");
  try {
    await writeFile(inPath, input);
    const dpi = String(cfg.pdfImageDpiFloor);
    const { code } = await runCmd(
      "gs",
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dPDFSETTINGS=/printer",
        `-dColorImageResolution=${dpi}`,
        `-dGrayImageResolution=${dpi}`,
        `-dMonoImageResolution=${dpi}`,
        "-dColorImageDownsampleType=/Bicubic",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        `-sOutputFile=${outPath}`,
        inPath,
      ],
      60_000,
    );
    if (code !== 0) return null;
    return await readFile(outPath);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function countPagesHeuristic(buf: Buffer): number | null {
  const m = buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : null;
}

export async function processPdf(
  input: Buffer,
  cfg: QualityPolicyConfig = loadQualityPolicyConfig(),
): Promise<PdfProcessResult> {
  if (hasPdfJavascriptOrEmbedded(input)) {
    return {
      body: input,
      qualityNote: "ORIGINAL_KEPT",
      pageCount: null,
      skipped: true,
      rejected: true,
      rejectReason: "pdf_javascript_or_embedded",
    };
  }

  const pageCount = countPagesHeuristic(input);
  const decision = decide({ sizeBytes: input.length, mimeType: "application/pdf" }, cfg);
  if (decision.action === "KEEP") {
    return { body: input, qualityNote: "ORIGINAL_KEPT", pageCount, skipped: false };
  }

  const lossless = await qpdfOptimize(input);
  if (lossless && lossless.length <= cfg.thresholdBytes) {
    return { body: lossless, qualityNote: "LOSSLESS", pageCount: countPagesHeuristic(lossless) ?? pageCount, skipped: false };
  }

  let best = lossless && lossless.length < input.length ? lossless : input;
  let note: QualityNote = lossless ? "LOSSLESS" : "ORIGINAL_KEPT";

  if (best.length > cfg.thresholdBytes) {
    const gs = await ghostscriptPrinter(best, cfg);
    if (gs && gs.length < best.length) {
      const pagesOk =
        (countPagesHeuristic(gs) ?? pageCount) === null ||
        (countPagesHeuristic(gs) ?? -1) === (pageCount ?? countPagesHeuristic(gs));
      if (pagesOk) {
        best = gs;
        note = gs.length <= cfg.thresholdBytes ? "REDUCED" : "FLOOR_REACHED";
      }
    } else if (best.length > cfg.thresholdBytes) {
      note = "FLOOR_REACHED";
    }
  }

  return { body: best, qualityNote: note, pageCount: countPagesHeuristic(best) ?? pageCount, skipped: false };
}
