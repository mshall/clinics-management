export type EtaFailureClass = "temporary" | "permanent" | "unclear" | "credentials" | "duplicate";

function bodyLooksLikeDuplicate(bodySnippet: string): boolean {
  return /uuid.*already|duplicate|already exists|already submitted|previously registered/i.test(bodySnippet);
}

function bodyLooksLikeAuth(bodySnippet: string): boolean {
  return /invalid_client|invalid_grant|unauthorized_client|access_denied|access\.denied|deactivated|expired.*secret|expired.*credential|token.*expired|pos.*deactivated|client_secret/i.test(
    bodySnippet,
  );
}

/**
 * Classify ETA HTTP failures. Auth and duplicate UUID are never permanent validation rejections.
 */
export function classifyEtaHttpFailure(
  httpStatus: number,
  bodySnippet = "",
  context: "token" | "submit" = "submit",
): EtaFailureClass {
  if (httpStatus === 401 || httpStatus === 403) return "credentials";
  if (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429) return "temporary";
  if (httpStatus === 409 || bodyLooksLikeDuplicate(bodySnippet)) return "duplicate";
  if (/timeout|timed out|ECONNRESET|ENOTFOUND|fetch failed/i.test(bodySnippet)) return "temporary";

  if (httpStatus >= 400 && httpStatus < 500) {
    if (context === "token") {
      if (httpStatus === 400 || bodyLooksLikeAuth(bodySnippet)) return "credentials";
      return "credentials";
    }
    if (bodyLooksLikeAuth(bodySnippet)) return "credentials";
    return "permanent";
  }
  return "unclear";
}

export function classifyEtaNetworkError(message: string): EtaFailureClass {
  if (/timeout|ECONNRESET|ENOTFOUND|network|socket/i.test(message)) return "temporary";
  return "unclear";
}