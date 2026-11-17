const MAX_ATTEMPTS = 5;

export function nextRetryAt(attemptCount: number): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const delayMs = Math.min(3_600_000, 60_000 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMs);
}

export function workerStatusForFailure(retryable: boolean, attemptCount: number): "RETRY" | "FAILED" {
  if (retryable && attemptCount < MAX_ATTEMPTS) return "RETRY";
  return "FAILED";
}

export const WHATSAPP_MAX_SEND_ATTEMPTS = MAX_ATTEMPTS;