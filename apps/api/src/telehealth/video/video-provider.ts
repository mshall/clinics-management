import type { TelehealthRole } from "@prisma/client";
import type { IceServer, TurnMode } from "../turn/turn-credentials.provider";

export type VideoJoinInfo = { transport: "p2p-webrtc"; iceServers: IceServer[]; turn: TurnMode; iceExpiresInSeconds: number | null };

/**
 * ADR-039. The media transport behind a telehealth session. Shipped: P2PWebRtcProvider (browser-to-browser, NO media through our
 * servers, no recording). A future SFU (e.g. self-hosted) would be another implementation; paid vendor SDKs are not an option.
 */
export interface VideoProvider {
  readonly name: string;
  prepareJoin(input: { sessionId: string; role: TelehealthRole; remainingWindowSeconds: number }): Promise<VideoJoinInfo>;
}
export const VIDEO_PROVIDER = Symbol("VIDEO_PROVIDER");
