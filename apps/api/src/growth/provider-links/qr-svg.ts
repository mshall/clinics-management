import QRCode from "qrcode";

/**
 * Server-side QR codes (ARCH 4.2): local `qrcode` library, error correction M, 4-module quiet zone, no third-party QR service.
 * The payload is always the link URL only (no patient data, nothing variable but the code).
 */
const BASE = { errorCorrectionLevel: "M" as const, margin: 4 };

export async function qrSvg(url: string, opts?: { color?: string; background?: string }): Promise<string> {
  return QRCode.toString(url, {
    ...BASE,
    type: "svg",
    color: { dark: opts?.color ?? "#000000", light: opts?.background ?? "#ffffff" },
  });
}

export async function qrPng(url: string, width = 768): Promise<Buffer> {
  const w = Math.min(2048, Math.max(128, Math.round(width)));
  return QRCode.toBuffer(url, { ...BASE, type: "png", width: w, color: { dark: "#000000", light: "#ffffff" } });
}
