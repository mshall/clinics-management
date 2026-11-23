import { STUN_SERVERS, type IceServersResult, type TurnCredentialsProvider } from "./turn-credentials.provider";

/** Local dev, CI and any environment without the Cloudflare TURN secret: STUN only (direct P2P; symmetric NATs may fail). */
export class StunOnlyTurnProvider implements TurnCredentialsProvider {
  async getIceServers(): Promise<IceServersResult> {
    return { iceServers: STUN_SERVERS.map((s) => ({ ...s })), turn: "stun-only", expiresInSeconds: null };
  }
}
