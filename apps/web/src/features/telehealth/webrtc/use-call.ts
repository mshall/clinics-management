import { useCallback, useEffect, useRef, useState } from "react";
import { P2PPeer, type IceServer } from "./peer";
import { computeQuality, sampleFromReport, type Quality, type StatSample } from "./quality";
import { startPolling, type PollResult, type SessionStatus, type SignalingClient, type SignalMsg } from "./signaling-client";

export type JoinInfo = {
  role: "CLINICIAN" | "PATIENT";
  sessionId: string;
  sessionStatus: SessionStatus;
  mode: "VIDEO" | "AUDIO";
  peerJoined: boolean;
  iceServers: IceServer[];
  turn: "turn" | "stun-only" | "degraded";
  pollIntervalMs: number;
  appointment: Record<string, string | null>;
  opensAt: string;
  closesAt: string;
};

export type CallPhase = "idle" | "joining" | "waiting" | "connecting" | "live" | "ended" | "error";
export type Devices = { audioId?: string; videoId?: string; audioOnly?: boolean };

const MAX_ICE_RESTARTS = 6;

/** The whole call lifecycle: media, join, signaling poll loop, perfect-negotiation peer, ICE restart, quality, end. */
export function useCall(args: { polite: boolean; join: () => Promise<JoinInfo>; client: SignalingClient }) {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [connection, setConnection] = useState<RTCPeerConnectionState | "new">("new");
  const [quality, setQuality] = useState<Quality>("unknown");
  const [reconnecting, setReconnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [attended, setAttended] = useState(false);

  const peerRef = useRef<P2PPeer | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const stopPollRef = useRef<(() => void) | null>(null);
  const seqRef = useRef(0);
  const restartsRef = useRef(0);
  const argsRef = useRef(args);
  argsRef.current = args;
  const finished = useRef(false);

  const cleanup = useCallback(() => {
    stopPollRef.current?.();
    stopPollRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleResult = useCallback(async (r: PollResult) => {
    setPeerPresent(r.peerPresent);
    setAttended(r.attended);
    setAudioOnly(r.mode === "AUDIO");
    const sorted = [...r.messages].sort((a, b) => a.seq - b.seq);
    for (const m of sorted as SignalMsg[]) {
      if (m.seq <= seqRef.current) continue;
      seqRef.current = m.seq;
      if (m.type === "BYE") continue;
      await peerRef.current?.handleSignal(m);
    }
    if (r.sessionStatus === "ENDED" || r.sessionStatus === "CANCELLED" || r.sessionStatus === "MISSED") {
      if (!finished.current) {
        finished.current = true;
        setEndReason(r.endReason ?? r.sessionStatus);
        setPhase("ended");
        cleanup();
      }
    } else if (r.peerPresent) {
      setPhase((p) => (p === "waiting" ? "connecting" : p));
    } else {
      setPhase((p) => (p === "connecting" ? "waiting" : p));
    }
  }, [cleanup]);

  const acquire = useCallback(async (d: Devices): Promise<MediaStream> => {
    const audio: MediaTrackConstraints | boolean = d.audioId ? { deviceId: { exact: d.audioId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true };
    if (d.audioOnly) return navigator.mediaDevices.getUserMedia({ audio, video: false });
    const video: MediaTrackConstraints = { ...(d.videoId ? { deviceId: { exact: d.videoId } } : { facingMode: "user" }), width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video });
    } catch (e) {
      // camera unavailable/denied: continue audio-only instead of failing the whole visit
      if ((e as DOMException)?.name === "NotAllowedError" || (e as DOMException)?.name === "NotFoundError" || (e as DOMException)?.name === "NotReadableError") {
        return navigator.mediaDevices.getUserMedia({ audio, video: false });
      }
      throw e;
    }
  }, []);

  const start = useCallback(async (devices: Devices) => {
    finished.current = false;
    setPhase("joining");
    setError(null);
    try {
      const stream = await acquire(devices);
      localRef.current = stream;
      setLocal(stream);
      if (stream.getVideoTracks().length === 0) setAudioOnly(true);
      const j = await argsRef.current.join();
      setInfo(j);
      const client = argsRef.current.client;
      const peer = new P2PPeer({
        iceServers: j.iceServers,
        polite: argsRef.current.polite,
        send: (type, payload) => client.send(type, payload),
        onRemoteStream: (s) => setRemote(s),
        onConnectionState: (s) => {
          setConnection(s);
          if (typeof window !== "undefined") (window as unknown as { __thConnection?: string }).__thConnection = s;
          if (s === "connected") {
            restartsRef.current = 0;
            setReconnecting(false);
            setPhase("live");
          } else if (s === "disconnected" || s === "failed") {
            setReconnecting(true);
          }
        },
        onError: () => undefined,
      });
      peerRef.current = peer;
      peer.addLocalStream(stream);
      if (j.mode === "AUDIO") setAudioOnly(true);
      setPhase(j.peerJoined ? "connecting" : "waiting");
      stopPollRef.current = startPolling(
        client,
        { getAfterSeq: () => seqRef.current, onResult: (r) => void handleResult(r), onError: (e) => { if ([404, 410, 403].includes((e as { status?: number })?.status ?? 0)) { setError(e); setPhase("error"); cleanup(); } } },
        { intervalMs: j.pollIntervalMs },
      );
    } catch (e) {
      setError(e);
      setPhase("error");
      cleanup();
    }
  }, [acquire, cleanup, handleResult]);

  // Automatic ICE restart while disconnected/failed: retry with spacing, give up after MAX_ICE_RESTARTS (the page then offers "Rejoin").
  useEffect(() => {
    if (!reconnecting) return;
    const id = setInterval(() => {
      if (restartsRef.current >= MAX_ICE_RESTARTS) return;
      restartsRef.current += 1;
      peerRef.current?.restartIce();
      if (argsRef.current.polite) void argsRef.current.client.send("RENEGOTIATE", {}).catch(() => undefined);
    }, 4000);
    return () => clearInterval(id);
  }, [reconnecting]);

  // Connection quality indicator from getStats().
  useEffect(() => {
    if (connection !== "connected") return;
    let prev: StatSample | null = null;
    const id = setInterval(async () => {
      const p = peerRef.current;
      if (!p) return;
      const cur = sampleFromReport(await p.getStats());
      setQuality(computeQuality(prev, cur));
      prev = cur;
    }, 3000);
    return () => clearInterval(id);
  }, [connection]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    const next = !cameraOff;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCameraOff(next);
  }, [cameraOff]);

  /** Audio-only switch: stop sending video (saves bandwidth on weak links) and tell the peer; switching back re-acquires the camera. */
  const setAudioOnlyMode = useCallback(async (on: boolean) => {
    const stream = localRef.current;
    const peer = peerRef.current;
    if (!stream || !peer) return;
    if (on) {
      stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
      const sender = peer.pc.getTransceivers().find((tr) => tr.receiver.track.kind === "video")?.sender;
      if (sender) await sender.replaceTrack(null).catch(() => undefined);
    } else {
      const cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } } });
      const track = cam.getVideoTracks()[0]!;
      stream.addTrack(track);
      const sender = peer.pc.getTransceivers().find((tr) => tr.receiver.track.kind === "video" && tr.sender.track == null)?.sender;
      if (sender) await sender.replaceTrack(track);
      else peer.pc.addTrack(track, stream);
      setCameraOff(false);
    }
    setAudioOnly(on);
    setLocal(new MediaStream(stream.getTracks()));
    await argsRef.current.client.setMode(on ? "AUDIO" : "VIDEO").catch(() => undefined);
  }, []);

  const hangUp = useCallback(async () => {
    finished.current = true;
    try {
      await argsRef.current.client.end();
    } catch {
      /* the sweep ends idle sessions */
    }
    setPhase("ended");
    setEndReason("ENDED_BY_PARTICIPANT");
    cleanup();
  }, [cleanup]);

  return { phase, error, info, local, remote, connection, quality, reconnecting, muted, cameraOff, audioOnly, peerPresent, endReason, attended, start, toggleMute, toggleCamera, setAudioOnlyMode, hangUp };
}
