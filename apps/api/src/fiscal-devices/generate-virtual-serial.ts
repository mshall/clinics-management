/** KIORLY-<MARKET>-<CLINICSHORT>-<NN> (≤30 chars, uppercase ASCII). */
export function clinicShortCode(clinicId: string): string {
  const clean = clinicId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return clean.slice(0, 6) || "CLINIC";
}

export function formatVirtualSerial(marketCode: string, clinicId: string, sequence: number): string {
  const market = marketCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "XX";
  const short = clinicShortCode(clinicId);
  const nn = String(Math.max(1, sequence)).padStart(2, "0");
  const raw = `KIORLY-${market}-${short}-${nn}`;
  return raw.slice(0, 30).toUpperCase();
}

export function assertValidFiscalSerial(serial: string): string {
  const s = serial.trim().toUpperCase();
  if (!s || s.length > 30) throw new Error("serial must be 1–30 ASCII characters");
  if (!/^[A-Z0-9-]+$/.test(s)) throw new Error("serial must be uppercase letters, digits, and hyphens only");
  return s;
}