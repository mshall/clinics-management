import type { Prisma } from "@prisma/client";

/**
 * Daily aggregates for provider links: counters only, never a patient or visitor identifier (no cookies, no fingerprint, no IP kept).
 * Day = UTC date (documented in Docs/GROWTH.md; the web shows it as the clinic's local day label only).
 */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type Client = Pick<Prisma.TransactionClient, "$executeRaw">;
export type LinkCounter = "visits" | "bookings" | "attended";

/** Atomic upsert-increment (safe under concurrency, unlike find-then-create). */
export async function bumpLinkCounter(db: Client, link: { id: string; tenantId: string }, counter: LinkCounter, at: Date = new Date(), by = 1): Promise<void> {
  const day = utcDay(at);
  const v = counter === "visits" ? by : 0;
  const b = counter === "bookings" ? by : 0;
  const a = counter === "attended" ? by : 0;
  await db.$executeRaw`
    INSERT INTO "ProviderReferralLinkDaily" ("linkId", "tenantId", "date", "visits", "bookings", "attended", "updatedAt")
    VALUES (${link.id}, ${link.tenantId}, ${day}, ${v}, ${b}, ${a}, now())
    ON CONFLICT ("linkId", "date") DO UPDATE SET
      "visits" = "ProviderReferralLinkDaily"."visits" + ${v},
      "bookings" = "ProviderReferralLinkDaily"."bookings" + ${b},
      "attended" = "ProviderReferralLinkDaily"."attended" + ${a},
      "updatedAt" = now()`;
}

const BOT_UA =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python-requests|python-urllib|go-http-client|okhttp\/|java\/|libwww|httpclient|axios|node-fetch|postman|facebookexternalhit|embedly|skypeuri|telegrambot|discordbot|slackbot|linkedinbot|twitterbot|applebot|bingpreview|google-read-aloud|chrome-lighthouse/i;

/** Visits that are clearly not a person following the link: no/odd user agent, known crawler or monitor, link-preview fetchers, browser prefetch. Honest limit: a bot that looks like a browser is still counted. */
export function isLikelyBot(headers: Record<string, string | string[] | undefined>): boolean {
  const h = (k: string) => {
    const v = headers[k];
    return (Array.isArray(v) ? v[0] : v)?.toString() ?? "";
  };
  const ua = h("user-agent").trim();
  if (ua.length < 12) return true;
  if (BOT_UA.test(ua)) return true;
  const purpose = `${h("purpose")} ${h("sec-purpose")} ${h("x-purpose")} ${h("x-moz")}`.toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("preview") || purpose.includes("prerender")) return true;
  return false;
}
