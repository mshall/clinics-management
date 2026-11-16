export type EtaFailureClass = "temporary" | "permanent" | "unclear";

export function classifyEtaHttpFailure(httpStatus: number, bodySnippet = ""): EtaFailureClass {
  if (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429) return "temporary";
  if (httpStatus >= 400 && httpStatus < 500) return "permanent";
  if (/timeout|timed out|ECONNRESET|ENOTFOUND|fetch failed/i.test(bodySnippet)) return "temporary";
  return "unclear";
}

export function classifyEtaNetworkError(message: string): EtaFailureClass {
  if (/timeout|ECONNRESET|ENOTFOUND|network|socket/i.test(message)) return "temporary";
  return "unclear";
}