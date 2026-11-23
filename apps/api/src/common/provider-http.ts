import { randomUUID } from "node:crypto";

/**
 * Provider-neutral outbound HTTP helper shared by the SMS, Email, WhatsApp and PSP `real` adapters.
 * Timeout, bounded retries with exponential backoff + jitter (Retry-After honoured), one idempotency key reused across
 * every attempt, status -> failure-class mapping, and secret redaction so keys never reach logs or error rows.
 */
export type ProviderFailureClass = "AUTH" | "TRANSIENT" | "TIMEOUT" | "PERMANENT" | "UNKNOWN";

export type ProviderHttpRequest = {
  url: string;
  method?: "POST" | "GET" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  /** application/x-www-form-urlencoded body (Twilio); wins over `body`. */
  form?: Record<string, string>;
  timeoutMs?: number;
  /** Retries AFTER the first attempt (default 2). */
  retries?: number;
  backoffMs?: number;
  idempotencyKey?: string;
  /** Header the provider reads the idempotency key from (default `Idempotency-Key`). */
  idempotencyHeader?: string;
  /** Strings (API keys, tokens) scrubbed from any error text. */
  secrets?: (string | undefined)[];
  /** Test seams. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export type ProviderHttpResult =
  | { ok: true; status: number; json: unknown; text: string; attempts: number; idempotencyKey: string }
  | {
      ok: false;
      status?: number;
      error: string;
      text: string;
      attempts: number;
      failureClass: ProviderFailureClass;
      retryable: boolean;
      idempotencyKey: string;
    };

export function redactSecrets(text: string, secrets: (string | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 4) out = out.split(s).join("***");
  }
  return out.replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1***");
}

export function classifyHttpStatus(status: number): { failureClass: ProviderFailureClass; retryable: boolean } {
  if (status === 401 || status === 403) return { failureClass: "AUTH", retryable: false };
  if (status === 408 || status === 425 || status === 429 || status >= 500) return { failureClass: "TRANSIENT", retryable: true };
  if (status >= 400) return { failureClass: "PERMANENT", retryable: false };
  return { failureClass: "UNKNOWN", retryable: false };
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 30_000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.min(Math.max(date - Date.now(), 0), 30_000);
}

export async function providerHttp(req: ProviderHttpRequest): Promise<ProviderHttpResult> {
  const doFetch = req.fetchImpl ?? fetch;
  const sleep = req.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = req.timeoutMs ?? 10_000;
  const maxAttempts = Math.max(0, req.retries ?? 2) + 1;
  const backoff = req.backoffMs ?? 300;
  const idempotencyKey = req.idempotencyKey ?? randomUUID();
  const headers: Record<string, string> = {
    "Content-Type": req.form ? "application/x-www-form-urlencoded" : "application/json",
    Accept: "application/json",
    ...(req.headers ?? {}),
    [req.idempotencyHeader ?? "Idempotency-Key"]: idempotencyKey,
  };
  const body = req.form ? new URLSearchParams(req.form).toString() : req.body === undefined ? undefined : JSON.stringify(req.body);

  let last: ProviderHttpResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let waitHint: number | null = null;
    try {
      const res = await doFetch(req.url, {
        method: req.method ?? "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (res.ok) {
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        return { ok: true, status: res.status, json, text, attempts: attempt, idempotencyKey };
      }
      const { failureClass, retryable } = classifyHttpStatus(res.status);
      waitHint = retryAfterMs(res.headers.get("retry-after"));
      last = {
        ok: false,
        status: res.status,
        error: redactSecrets(`HTTP ${res.status}: ${text.slice(0, 300)}`, req.secrets),
        text: redactSecrets(text.slice(0, 1000), req.secrets),
        attempts: attempt,
        failureClass,
        retryable,
        idempotencyKey,
      };
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      last = {
        ok: false,
        error: redactSecrets(timedOut ? `Timeout after ${timeoutMs}ms` : e instanceof Error ? e.message : String(e), req.secrets),
        text: "",
        attempts: attempt,
        failureClass: timedOut ? "TIMEOUT" : "TRANSIENT",
        retryable: true,
        idempotencyKey,
      };
    }
    if (!last.ok && last.retryable && attempt < maxAttempts) {
      const delay = waitHint ?? backoff * 2 ** (attempt - 1) + Math.floor(Math.random() * (backoff / 2 + 1));
      await sleep(delay);
      continue;
    }
    break;
  }
  return last!;
}

/** Pull a string out of a JSON body by dotted path candidates (`data.id`, `messages.0.id`). */
export function pickString(json: unknown, ...paths: string[]): string | null {
  for (const p of paths) {
    let cur: unknown = json;
    for (const seg of p.split(".")) {
      if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[seg];
      else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur.trim()) return cur;
    if (typeof cur === "number") return String(cur);
  }
  return null;
}
