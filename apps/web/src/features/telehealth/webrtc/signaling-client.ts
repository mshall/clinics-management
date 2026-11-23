/** ADR-039: HTTP-polling signaling client. The transport is an interface so a WebSocket/SSE one can replace it later. */
export type SignalType = "OFFER" | "ANSWER" | "ICE_CANDIDATE" | "BYE" | "RENEGOTIATE";
export type SignalMsg = { seq: number; type: SignalType; payload: Record<string, unknown>; fromRole: "CLINICIAN" | "PATIENT" };
export type SessionStatus = "SCHEDULED" | "WAITING" | "ACTIVE" | "ENDED" | "CANCELLED" | "MISSED";
export type PollResult = {
  messages: SignalMsg[];
  sessionStatus: SessionStatus;
  mode: "VIDEO" | "AUDIO";
  endReason: string | null;
  peerPresent: boolean;
  attended: boolean;
};

export interface SignalingClient {
  send(type: SignalType, payload: Record<string, unknown>): Promise<void>;
  poll(afterSeq: number): Promise<PollResult>;
  setMode(mode: "VIDEO" | "AUDIO"): Promise<void>;
  end(): Promise<void>;
}

export type JsonFetcher = <T>(method: "GET" | "POST", path: string, body?: unknown) => Promise<T>;

/** Same wire protocol for the clinician (auth'd base path) and the patient (token base path). */
export class HttpPollingClient implements SignalingClient {
  constructor(private readonly base: string, private readonly fetchJson: JsonFetcher) {}
  async send(type: SignalType, payload: Record<string, unknown>) {
    await this.fetchJson("POST", `${this.base}/signals`, { type, payload });
  }
  poll(afterSeq: number) {
    return this.fetchJson<PollResult>("GET", `${this.base}/signals?afterSeq=${afterSeq}`);
  }
  async setMode(mode: "VIDEO" | "AUDIO") {
    await this.fetchJson("POST", `${this.base}/mode`, { mode });
  }
  async end() {
    await this.fetchJson("POST", `${this.base}/end`, {});
  }
}

/** Poll loop: ~1.2 s cadence, backs off on errors, stops on abort. Calls onResult for every successful poll. */
export function startPolling(
  client: SignalingClient,
  handlers: { getAfterSeq: () => number; onResult: (r: PollResult) => void; onError: (e: unknown) => void },
  opts: { intervalMs?: number } = {},
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  const base = opts.intervalMs ?? 1200;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await client.poll(handlers.getAfterSeq());
      failures = 0;
      if (!stopped) handlers.onResult(r);
    } catch (e) {
      failures += 1;
      handlers.onError(e);
      if ((e as { status?: number })?.status && [404, 410, 403, 402, 409].includes((e as { status: number }).status)) {
        stopped = true; // terminal: the page renders the matching end screen
        return;
      }
    }
    if (!stopped) timer = setTimeout(tick, Math.min(8000, base * (1 + failures)));
  };
  timer = setTimeout(tick, 0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
