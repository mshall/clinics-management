export const WHATSAPP_FAILURE_SPIKE_THRESHOLD = 12;
export const WHATSAPP_FAILURE_SPIKE_WINDOW_MS = 60 * 60 * 1000;

export function whatsappFailureSpike(failuresLastHour: number): boolean {
  return failuresLastHour >= WHATSAPP_FAILURE_SPIKE_THRESHOLD;
}