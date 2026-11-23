export type IceServer = { urls: string | string[]; username?: string; credential?: string };
/** "turn" = relay credentials issued; "stun-only" = no TURN configured (local/dev/mock); "degraded" = TURN configured but the provider call failed. */
export type TurnMode = "turn" | "stun-only" | "degraded";
export type IceServersResult = { iceServers: IceServer[]; turn: TurnMode; expiresInSeconds: number | null };

/**
 * ADR-039. Hands the browsers short-lived ICE servers. TURN is only USED by a call that cannot connect directly (browsers try
 * host/srflx candidates first), so cost is per relayed GB, not per call. The credential is minted on join and never stored.
 */
export interface TurnCredentialsProvider {
  getIceServers(opts: { ttlSeconds: number }): Promise<IceServersResult>;
}
export const TURN_CREDENTIALS_PROVIDER = Symbol("TURN_CREDENTIALS_PROVIDER");

/** Cloudflare STUN is free and unlimited. Google STUN is a second candidate source, not a dependency. */
export const STUN_SERVERS: IceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
