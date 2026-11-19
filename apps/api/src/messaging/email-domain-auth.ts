import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

/** Platform file + env overrides for SES sending-domain authentication (MS-05). */
export type EmailDomainAuth = {
  sendingDomain: string;
  fromAddress: string;
  region: string;
  dkimVerified: boolean;
  spfVerified: boolean;
  dmarcVerified: boolean;
};

const DEFAULT: EmailDomainAuth = {
  sendingDomain: "mail.kiorly.com",
  fromAddress: "noreply@mail.kiorly.com",
  region: "eu-central-1",
  dkimVerified: false,
  spfVerified: false,
  dmarcVerified: false,
};

function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "platform", "email-domain-auth.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(__dirname, "..", "..", "..", "..");
}

export function emailDomainAuthPath(): string {
  return process.env.EMAIL_DOMAIN_AUTH_PATH?.trim() || join(repoRoot(), "platform", "email-domain-auth.json");
}

export function loadEmailDomainAuth(path = emailDomainAuthPath()): EmailDomainAuth {
  let file: Partial<EmailDomainAuth> = {};
  try {
    file = JSON.parse(readFileSync(path, "utf8")) as Partial<EmailDomainAuth>;
  } catch {
    /* missing file → defaults; production gate still applies */
  }
  const envBool = (key: string, fallback: boolean): boolean => {
    const raw = process.env[key]?.trim().toLowerCase();
    if (raw === "1" || raw === "true" || raw === "yes") return true;
    if (raw === "0" || raw === "false" || raw === "no") return false;
    return fallback;
  };
  return {
    sendingDomain: process.env.EMAIL_SENDING_DOMAIN?.trim() || file.sendingDomain || DEFAULT.sendingDomain,
    fromAddress: process.env.EMAIL_FROM_ADDRESS?.trim() || file.fromAddress || DEFAULT.fromAddress,
    region: process.env.EMAIL_SES_REGION?.trim() || file.region || DEFAULT.region,
    dkimVerified: envBool("EMAIL_DKIM_VERIFIED", file.dkimVerified ?? DEFAULT.dkimVerified),
    spfVerified: envBool("EMAIL_SPF_VERIFIED", file.spfVerified ?? DEFAULT.spfVerified),
    dmarcVerified: envBool("EMAIL_DMARC_VERIFIED", file.dmarcVerified ?? DEFAULT.dmarcVerified),
  };
}

/** Production may only send when DKIM, SPF and DMARC are all verified for the sending domain. */
export function assertEmailDomainAuthReady(auth: EmailDomainAuth = loadEmailDomainAuth()): void {
  const missing: string[] = [];
  if (!auth.dkimVerified) missing.push("DKIM");
  if (!auth.spfVerified) missing.push("SPF");
  if (!auth.dmarcVerified) missing.push("DMARC");
  if (missing.length) {
    throw new Error(`EMAIL_DOMAIN_AUTH_INCOMPLETE: ${missing.join(", ")} not verified for ${auth.sendingDomain}`);
  }
}

export function isEmailDomainAuthReady(auth: EmailDomainAuth = loadEmailDomainAuth()): boolean {
  return auth.dkimVerified && auth.spfVerified && auth.dmarcVerified;
}
