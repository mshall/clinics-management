/** Pure helpers of the Growth workspace (no React), unit-tested in growth.node.test.ts. */

export type OriginProblem = "NOT_HTTPS" | "WILDCARD" | "HAS_PATH" | "MALFORMED" | "DUPLICATE" | "TOO_MANY";
export const WIDGET_MAX_ORIGINS = 10;
/** Same rule as the contract (`isValidWidgetOrigin`): exact https origin, a host with a dot, optional port. */
const ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/;

export function parseOriginLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** Per-line problems so the form can point at the exact line; mirrors the server (the server stays the authority). */
export function originProblems(lines: string[]): Array<{ line: number; origin: string; problem: OriginProblem }> {
  const out: Array<{ line: number; origin: string; problem: OriginProblem }> = [];
  const seen = new Set<string>();
  lines.forEach((raw, i) => {
    const o = raw.trim().toLowerCase();
    const bare = o.replace(/\/$/, "");
    let problem: OriginProblem | null = null;
    if (o.includes("*")) problem = "WILDCARD";
    else if (!o.startsWith("https://")) problem = "NOT_HTTPS";
    else if (/^https:\/\/[^/]+\/./.test(o) || o.includes("?") || o.includes("#")) problem = "HAS_PATH";
    else if (!ORIGIN.test(bare)) problem = "MALFORMED";
    else if (seen.has(bare)) problem = "DUPLICATE";
    if (problem) out.push({ line: i + 1, origin: raw, problem });
    else seen.add(bare);
  });
  if (lines.length > WIDGET_MAX_ORIGINS) out.push({ line: WIDGET_MAX_ORIGINS + 1, origin: lines[WIDGET_MAX_ORIGINS]!, problem: "TOO_MANY" });
  return out;
}

export const pct = (v: number | null | undefined, lang: string): string =>
  v == null ? "-" : `${new Intl.NumberFormat(lang.startsWith("ar") ? "ar-EG" : "en", { maximumFractionDigits: 1 }).format(v * 100)}%`;

export type LinkScope = "ORG" | "CLINIC" | "BRANCH" | "DOCTOR" | "DESK";
export const LINK_SCOPES: LinkScope[] = ["ORG", "CLINIC", "BRANCH", "DOCTOR", "DESK"];
export const LINK_CHANNELS = ["WEB_LINK", "QR_POSTER", "QR_DESK", "SOCIAL", "SMS", "WHATSAPP_SHARE", "EMAIL_SIG", "GOOGLE_PROFILE"] as const;

/** Create-form readiness: which field the chosen scope still needs (null = ready). */
export function createLinkError(f: { label: string; scope: LinkScope; branchRef: string; clinicianId: string; deskLabel: string; campaign: string }): string | null {
  if (f.label.trim().length < 2) return "label";
  if (f.scope === "BRANCH" && !f.branchRef) return "branchRef";
  if (f.scope === "DOCTOR" && !f.clinicianId) return "clinicianId";
  if (f.scope === "DESK" && f.deskLabel.trim().length < 2) return "deskLabel";
  if (f.campaign.trim() && !/^[a-z0-9][a-z0-9_.-]{0,39}$/.test(f.campaign.trim().toLowerCase())) return "campaign";
  return null;
}

/** Recommendations may only come from this closed list (mirrors the API catalogue); anything else is dropped, never rendered. */
export const RECOMMENDATION_IDS = ["AVAILABILITY_MISSING", "AVAILABILITY_NO_BOOKABLE_TYPES", "PROFILE_INCOMPLETE", "RESPONSE_OVERDUE", "CANCELLATIONS_HIGH", "NO_SHOW_HIGH", "CREATE_FIRST_LINK", "PRINT_RECEPTION_QR", "ENABLE_WIDGET", "PAGE_NOT_READY", "PROFILE_PHOTO_MISSING", "PROFILE_BIO_INCOMPLETE", "PUBLISH_MORE_SLOTS", "RESPOND_TO_REVIEW", "ADD_LANGUAGE", "VERIFICATION_PENDING", "LINK_CONVERSION_LOW", "LINK_PAUSED_IDLE", "SOCIAL_TEMPLATE_UNUSED", "STATEMENT_DISPUTE_CLOSING", "PLAN_LIMIT_NEAR"] as const;
export const isKnownRecommendation = (id: string): id is (typeof RECOMMENDATION_IDS)[number] => (RECOMMENDATION_IDS as readonly string[]).includes(id);

export function lastMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
