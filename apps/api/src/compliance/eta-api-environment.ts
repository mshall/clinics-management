export type EtaApiEnvironment = "preprod" | "production" | "unknown";

/** Resolved from process env (staging boot sets preprod when unset). */
export function resolveEtaApiEnvironment(): EtaApiEnvironment {
  const raw =
    process.env.ETA_API_BASE_URL?.trim() ||
    (process.env.KIORLY_ENV === "staging" ? "https://api.preprod.invoicing.eta.gov.eg" : "");
  if (!raw) return "unknown";
  if (/preprod/i.test(raw)) return "preprod";
  if (/invoicing\.eta\.gov\.eg/i.test(raw) && !/preprod/i.test(raw)) return "production";
  return "unknown";
}