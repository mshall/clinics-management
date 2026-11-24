import { type ArgumentsHost, HttpStatus, Logger } from "@nestjs/common";

/**
 * `pg` reports pool saturation (every pooled connection busy for longer than the pool timeout) as a plain `Error`, not a Prisma error, so it fell through to the
 * catch-all `IntegrationFailureExceptionFilter` and clients got an unexplained 500. It is a transient overload, not a bug: answer 503 with Retry-After so
 * clients and probes back off and retry. Used by the catch-all filter (the only filter that sees non-Prisma errors) and by the Prisma filter (P2024).
 */
const POOL_PATTERNS = [
  /timeout exceeded when trying to connect/i, // pg-pool connectionTimeoutMillis
  /timed out fetching a new connection from the connection pool/i, // Prisma P2024 wording
  /sorry, too many clients already/i, // Postgres max_connections reached (53300)
  /remaining connection slots are reserved/i,
  /connection terminated (due to connection timeout|unexpectedly)/i,
];
export function isDbPoolExhausted(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const code = (e as { code?: unknown }).code;
  if (code === "P2024" || code === "53300" || code === "53400") return true;
  return POOL_PATTERNS.some((p) => p.test(e.message));
}

const log = new Logger("DbPool");

/** Sends the 503 when `exception` is pool saturation; returns false (and sends nothing) otherwise. */
export function replyIfDbPoolExhausted(exception: unknown, host: ArgumentsHost): boolean {
  if (!isDbPoolExhausted(exception)) return false;
  const http = host.switchToHttp();
  const res = http.getResponse();
  const req = http.getRequest<{ method?: string; url?: string }>();
  log.warn(`DB pool saturated ${req.method} ${req.url}: ${(exception as Error).message}`);
  res.status(HttpStatus.SERVICE_UNAVAILABLE);
  res.setHeader("Retry-After", "2");
  res.json({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, error: "Database busy", message: "The service is briefly overloaded. Please retry in a moment.", retryAfterSeconds: 2 });
  return true;
}
