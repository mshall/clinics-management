import type { VideoJoinInfo, VideoProvider } from "./video-provider";
import type { TurnCredentialsProvider } from "../turn/turn-credentials.provider";

export class P2PWebRtcProvider implements VideoProvider {
  readonly name = "p2p-webrtc";
  constructor(private readonly turn: TurnCredentialsProvider) {}

  async prepareJoin(input: { remainingWindowSeconds: number }): Promise<VideoJoinInfo> {
    const r = await this.turn.getIceServers({ ttlSeconds: input.remainingWindowSeconds + 900 });
    return { transport: "p2p-webrtc", iceServers: r.iceServers, turn: r.turn, iceExpiresInSeconds: r.expiresInSeconds };
  }
}
