import { ApiError } from "@/lib/http";

export function errorToValidationIssues(error: unknown): string[] {
  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const o = error.body as { message?: unknown };
    if (Array.isArray(o.message)) {
      return o.message.map((part) => String(part).trim()).filter(Boolean);
    }
  }
  if (error instanceof ApiError) {
    const msg = error.message.trim();
    if (!msg) return [error.message];
    if (msg.includes("; ")) return msg.split("; ").map((part) => part.trim()).filter(Boolean);
    return [msg];
  }
  if (error instanceof Error) {
    const msg = error.message.trim();
    return msg ? [msg] : [String(error)];
  }
  return [String(error)];
}
