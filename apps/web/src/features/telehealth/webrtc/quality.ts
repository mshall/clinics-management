export type Quality = "good" | "fair" | "poor" | "unknown";
export type StatSample = { packetsReceived: number; packetsLost: number; rttMs: number | null; jitterMs: number | null };

/** Pure: derive a quality bucket from two consecutive getStats() samples (loss ratio over the interval + RTT + jitter). */
export function computeQuality(prev: StatSample | null, cur: StatSample): Quality {
  if (!prev) return "unknown";
  const recv = cur.packetsReceived - prev.packetsReceived;
  const lost = cur.packetsLost - prev.packetsLost;
  if (recv <= 0 && lost <= 0) return "poor"; // nothing flowing
  const total = Math.max(1, recv + Math.max(0, lost));
  const loss = Math.max(0, lost) / total;
  const rtt = cur.rttMs ?? 0;
  const jitter = cur.jitterMs ?? 0;
  if (loss > 0.1 || rtt > 600 || jitter > 120) return "poor";
  if (loss > 0.03 || rtt > 300 || jitter > 50) return "fair";
  return "good";
}

/** Reads inbound-rtp + selected candidate-pair into a StatSample. */
export function sampleFromReport(report: RTCStatsReport): StatSample {
  let packetsReceived = 0;
  let packetsLost = 0;
  let jitterMs: number | null = null;
  let rttMs: number | null = null;
  report.forEach((s) => {
    const r = s as unknown as Record<string, number | string | boolean | undefined>;
    if (s.type === "inbound-rtp") {
      packetsReceived += Number(r.packetsReceived ?? 0);
      packetsLost += Number(r.packetsLost ?? 0);
      if (typeof r.jitter === "number") jitterMs = Math.max(jitterMs ?? 0, r.jitter * 1000);
    }
    if (s.type === "candidate-pair" && (r.selected === true || r.state === "succeeded") && typeof r.currentRoundTripTime === "number") {
      rttMs = Math.max(rttMs ?? 0, r.currentRoundTripTime * 1000);
    }
  });
  return { packetsReceived, packetsLost, rttMs, jitterMs };
}
