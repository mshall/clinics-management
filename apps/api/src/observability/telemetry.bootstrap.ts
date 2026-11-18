/**
 * Optional error tracking / tracing bootstrap (QA-05).
 * Full Sentry SDK or OTel SDK can attach via env without code changes in production images.
 */
export function bootstrapTelemetry(): void {
  const sentryDsn = process.env.SENTRY_DSN?.trim();
  const otlp = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const service = process.env.OTEL_SERVICE_NAME?.trim() || "kiorly-api";

  if (sentryDsn) {
    process.stderr.write(
      JSON.stringify({
        level: "info",
        msg: "SENTRY_DSN set — attach @sentry/node in container build for capture",
        service,
      }) + "\n",
    );
  }
  if (otlp) {
    process.stderr.write(
      JSON.stringify({
        level: "info",
        msg: "OTEL_EXPORTER_OTLP_ENDPOINT set — use OTel collector or App Runner observability",
        endpoint: otlp,
        service,
      }) + "\n",
    );
  }

  process.on("unhandledRejection", (reason) => {
    process.stderr.write(
      JSON.stringify({
        level: "error",
        msg: "unhandledRejection",
        reason: reason instanceof Error ? reason.message : String(reason),
      }) + "\n",
    );
  });
}