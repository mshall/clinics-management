import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type PdpcFilingStatus = "pending" | "filed" | "approved";

export type PdpcEgyptFilingRow = {
  id: string;
  titleEn: string;
  titleAr: string;
  status: PdpcFilingStatus;
  filedAt: string | null;
  reference: string | null;
};

export type PdpcEgyptFilingsRegistry = {
  version: number;
  decisionId: string;
  marketCode: string;
  dpo: {
    nameEn: string;
    nameAr: string;
    contactEmail: string;
    appointedAt: string | null;
    registeredWithPdpcAt: string | null;
    pdpcRegistrationRef: string | null;
  };
  filings: PdpcEgyptFilingRow[];
  recordsOfProcessing: { document: string; publishedAt: string | null };
  breachProcedure: {
    document: string;
    adoptedAt: string | null;
    pdpcNotifyHours: number;
    subjectNotifyDays: number;
  };
};

function repoRootFromApiSrc(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "platform", "pdpc-egypt-filings.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(__dirname, "..", "..", "..", "..", "..");
}

let cached: PdpcEgyptFilingsRegistry | null = null;

export function loadPdpcEgyptFilingsRegistry(): PdpcEgyptFilingsRegistry {
  if (cached) return cached;
  const override = process.env.PDPC_EGYPT_FILINGS_PATH?.trim();
  const path =
    override && override !== "undefined" ?
      override
    : join(repoRootFromApiSrc(), "platform", "pdpc-egypt-filings.json");
  const raw = readFileSync(path, "utf8");
  cached = JSON.parse(raw) as PdpcEgyptFilingsRegistry;
  return cached;
}

export function clearPdpcEgyptFilingsCache(): void {
  cached = null;
}

const IN_HAND: PdpcFilingStatus[] = ["filed", "approved"];

export function filingIsInHand(status: PdpcFilingStatus): boolean {
  return IN_HAND.includes(status);
}

export function listUnreadyPdpcFilings(reg = loadPdpcEgyptFilingsRegistry()): PdpcEgyptFilingRow[] {
  return reg.filings.filter((f) => !filingIsInHand(f.status));
}

export function isEgyptDpoRegistered(reg = loadPdpcEgyptFilingsRegistry()): boolean {
  return Boolean(reg.dpo.registeredWithPdpcAt?.trim() && reg.dpo.appointedAt?.trim());
}

export function isEgyptPdpcReadyForPaidLaunch(reg = loadPdpcEgyptFilingsRegistry()): boolean {
  if (!reg.recordsOfProcessing.publishedAt?.trim()) return false;
  if (!reg.breachProcedure.adoptedAt?.trim()) return false;
  if (!isEgyptDpoRegistered(reg)) return false;
  return reg.filings.every((f) => filingIsInHand(f.status));
}

export function egyptPdpcLaunchGateSummary(reg = loadPdpcEgyptFilingsRegistry()): {
  ready: boolean;
  decisionId: string;
  unreadyFilings: string[];
  dpoRegistered: boolean;
} {
  return {
    ready: isEgyptPdpcReadyForPaidLaunch(reg),
    decisionId: reg.decisionId,
    unreadyFilings: listUnreadyPdpcFilings(reg).map((f) => f.id),
    dpoRegistered: isEgyptDpoRegistered(reg),
  };
}