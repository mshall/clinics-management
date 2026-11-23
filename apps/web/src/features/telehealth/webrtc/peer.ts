import type { SignalMsg, SignalType } from "./signaling-client";

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

/**
 * ADR-039: native RTCPeerConnection, "perfect negotiation" (MDN pattern). The patient is POLITE (yields on offer collisions), the
 * clinician IMPOLITE. Media goes browser-to-browser; nothing here talks to a media server and nothing records. Screen share is a TODO hook:
 * add a second sender via `addTrack` and negotiate like any other track (out of scope for v1).
 */
export class P2PPeer {
  readonly pc: RTCPeerConnection;
  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswer = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private closed = false;

  constructor(
    private readonly opts: {
      iceServers: IceServer[];
      polite: boolean;
      send: (type: SignalType, payload: Record<string, unknown>) => Promise<void>;
      onRemoteStream: (s: MediaStream) => void;
      onConnectionState: (s: RTCPeerConnectionState) => void;
      onError?: (e: unknown) => void;
    },
  ) {
    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers as RTCIceServer[], iceCandidatePoolSize: 2 });
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) void this.opts.send("ICE_CANDIDATE", { candidate: candidate.toJSON() }).catch((e) => this.opts.onError?.(e));
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.opts.onRemoteStream(stream);
    };
    this.pc.onconnectionstatechange = () => this.opts.onConnectionState(this.pc.connectionState);
    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        await this.opts.send("OFFER", { description: this.pc.localDescription!.toJSON() });
      } catch (e) {
        this.opts.onError?.(e);
      } finally {
        this.makingOffer = false;
      }
    };
  }

  addLocalStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) this.pc.addTrack(track, stream);
  }

  async handleSignal(msg: SignalMsg): Promise<void> {
    if (this.closed) return;
    try {
      if (msg.type === "OFFER" || msg.type === "ANSWER") {
        const description = msg.payload.description as RTCSessionDescriptionInit;
        const readyForOffer = !this.makingOffer && (this.pc.signalingState === "stable" || this.settingRemoteAnswer);
        const collision = description.type === "offer" && !readyForOffer;
        this.ignoreOffer = !this.opts.polite && collision;
        if (this.ignoreOffer) return;
        this.settingRemoteAnswer = description.type === "answer";
        await this.pc.setRemoteDescription(description);
        this.settingRemoteAnswer = false;
        for (const c of this.pendingCandidates.splice(0)) await this.pc.addIceCandidate(c).catch(() => undefined);
        if (description.type === "offer") {
          await this.pc.setLocalDescription();
          await this.opts.send("ANSWER", { description: this.pc.localDescription!.toJSON() });
        }
      } else if (msg.type === "ICE_CANDIDATE") {
        const candidate = msg.payload.candidate as RTCIceCandidateInit;
        if (!this.pc.remoteDescription) {
          this.pendingCandidates.push(candidate);
          return;
        }
        try {
          await this.pc.addIceCandidate(candidate);
        } catch (e) {
          if (!this.ignoreOffer) this.opts.onError?.(e);
        }
      } else if (msg.type === "RENEGOTIATE") {
        this.restartIce();
      }
    } catch (e) {
      this.opts.onError?.(e);
    }
  }

  /** Automatic ICE restart ("Reconnecting..."): same peer connection, new candidates, no new link. */
  restartIce(): void {
    if (this.closed) return;
    this.pc.restartIce();
  }

  replaceVideoTrack(track: MediaStreamTrack | null): void {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video" || (s.track == null));
    if (sender && track) void sender.replaceTrack(track);
  }

  async getStats(): Promise<RTCStatsReport> {
    return this.pc.getStats();
  }

  close(): void {
    this.closed = true;
    try {
      this.pc.getSenders().forEach((s) => s.track?.stop?.());
      this.pc.close();
    } catch {
      /* already closed */
    }
  }
}
