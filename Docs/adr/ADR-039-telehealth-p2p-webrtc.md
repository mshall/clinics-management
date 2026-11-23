# ADR-039: Telehealth over our own peer-to-peer WebRTC (no video vendor)

- Status: ACCEPTED by the founder for implementation (23 Nov 2026); register the row in KX-01 when the lead merges.
- Scope: Kiorly Clinic (all editions). Kiorex consumes the session link; it does not own the media session for these bookings.

## Decision

1. **Clinic owns the telehealth session.** `TelehealthSession` is 1:1 with an `Appointment` (`serviceLocation = VIDEO`, derived `visitType: TELEHEALTH`). Clinic stays the only system of record for appointments (ADR-005).
2. **Media is browser-to-browser WebRTC with the native `RTCPeerConnection`.** No media passes through our servers. No recording, no server-side media processing, no paid video vendor or SDK anywhere (not Daily, Twilio, Chime, LiveKit or similar).
3. **Signaling is HTTP polling (about 1.2 s)** over the API and the database, behind a `SignalingTransport` interface (`HttpPollingSignaling`). Signals are SDP/ICE only (no PHI), `seq` is monotonic per session, rows are purged after 24 h.
4. **ICE servers:** Cloudflare STUN (free, unlimited) + **Cloudflare Realtime TURN** with short-lived credentials minted per join (`TurnCredentialsProvider` / `CloudflareTurnProvider`, `POST https://rtc.live.cloudflare.com/v1/turn/keys/<keyId>/credentials/generate-ice-servers`, bearer = the TURN key secret, body `{ttl}`, ttl = remaining join window + 15 min, clamped 10 min to 4 h). When the secret is missing or Cloudflare fails the join returns STUN-only (`turn: "stun-only" | "degraded"`): direct P2P still works, only calls that need a relay can fail. Port-53 URLs are dropped.
5. **`VideoProvider` / `P2PWebRtcProvider`** is the media seam (a future self-hosted SFU would be another implementation).
6. **Join window is never stored and never in the token.** It is computed at join from the appointment's current start/end: opens 10 minutes before the start, closes 60 minutes after the scheduled end. A reschedule therefore moves the window and the link does not change.
7. **Patient link token** = `HMAC-SHA256({sessionId, patientId, linkVersion})` (base64url, no times, no PHI), key derived from the existing JWT signing secret (`TELEHEALTH_LINK_SECRET` can override). "Regenerate link" increments `linkVersion`; tokens with an older version are rejected (`TELEHEALTH_LINK_REVOKED`). Pages and APIs answer `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; tokens are never logged or audited.
8. **Attendance = check-in.** Both participants present continuously for 3 minutes (`TELEHEALTH_ATTENDANCE_SECONDS` overrides in tests) triggers `AppointmentsService.markAttended`, which runs the SAME `CommissionChargeService.onCheckIn` path (existing market rate row, EGP 40 per attended new Kiorex patient; unique per appointment so it can only bill once), emits `CHECKED_IN` once and creates the pre-filled Telehealth encounter once. The exactly-once guard is `TelehealthSession.attendedAt` (conditional update) plus the unique charge and the partial unique index on the encounter.
9. **No-shows.** Patient never joins within the org minutes (default 15, `Tenant.telehealthNoShowMinutes`) of the start: session `MISSED` + existing no-show rules. **Doctor never joined:** session `MISSED`, appointment left open and flagged for staff review (`needsStaffReview`), the patient is NOT charged.
10. **Flag and entitlement.** Flag `telehealth.video` (class Module, ON by default, scopes global/market/org) and entitlement `telehealth_video` (ON for every plan for now, changeable in `plans-matrix.ts`). OFF blocks NEW telehealth capability (403 `FEATURE_DISABLED`, VIDEO slots hidden from Kiorex, visit-type option hidden); already-scheduled visits stay visible and joinable with a banner (OFF never hides data).

## Alternatives considered

| Option | Why not |
|---|---|
| Daily.co (what `kiorex-platform` shipped as a dormant adapter) | Founder: no paid video vendor; per-minute cost; media and recordings through a third party. Stays dormant in Kiorex; Clinic-owned sessions replace it for `visitType=TELEHEALTH`. |
| Amazon Chime SDK | Per-attendee-minute pricing, SDK lock-in, AWS media plane. |
| Twilio Video | Same cost and lock-in class (and end-of-life announcements). |
| LiveKit (cloud) / self-hosted SFU | Needed only for group calls or recording; adds an always-on media service to run. Documented as the upgrade path below. |
| WebSocket signaling now | Needs sticky routing / pub-sub on App Runner. Polling at 1.2 s is cheap for 2 peers and fits the existing stack; the interface allows swapping later. |

## Cost model (goal: minimum possible)

- **STUN** is free and unlimited. **Direct P2P** (host/server-reflexive candidates, most mobile and home networks) costs nothing: no media touches us.
- **TURN is used only by calls that cannot connect directly** (symmetric NAT, strict corporate or some carrier networks). Cloudflare Realtime TURN is free for the first 1,000 GB and then USD 0.05 per GB of data sent from TURN to clients (verified on the Cloudflare docs, Nov 2026). At roughly 0.5 to 1 Mbps per direction a relayed 20-minute call moves about 150 to 300 MB, so the free tier covers roughly 3,000 to 6,000 relayed calls a month, and overage is about USD 0.008 to 0.015 per relayed call.
- **Signaling**: about 2 requests per second per participant (about 1,500 to 2,500 small requests for a 20-minute visit) on the existing API and database; no extra service. The in-process / EventBridge tick purges signals older than 24 h.
- No recording storage, no transcoding, no per-minute vendor fee.
- Credentials are minted per join with a ttl of the remaining window, so a leaked credential dies with the visit.

## SFU upgrade path (not built)

If group calls, screen share at scale or recording are ever required: add a `VideoProvider` backed by a self-hosted SFU (for example LiveKit OSS) behind the same `/telehealth/sessions/:id/join` contract (the join response already carries `transport`), keep Cloudflare TURN for relay, and move signaling to a push transport behind `SignalingTransport`. Screen share has a TODO hook in `webrtc/peer.ts` (extra sender negotiated like any track). Recording is out of scope and needs legal sign-off first.

## Privacy and compliance notes

- No recording anywhere. Media is end-to-end DTLS-SRTP between the browsers; when relayed, Cloudflare TURN forwards encrypted packets only. Cloudflare is therefore a (transport-only) sub-processor for relayed calls: listed in `Docs/SUB_PROCESSORS_BY_MARKET.md` as NEEDS_HUMAN legal review.
- Video consent wording and the clinical-governance gate Kiorex applies to `kiorex.telemedicine` are NEEDS_HUMAN (counsel/CMO). This ADR does not satisfy any launch gate.
- Audit trail (no SDP/ICE/IPs/tokens in metadata): `telehealth.session.created | joined | started | attended | mode_switched | ended | missed | link_regenerated | authz_denied`.

## Consequences

- Kiorex must read the additive `telehealth` block and `VIDEO` location and stop creating Daily rooms for these bookings (contracts PR in `Docs/contracts/telehealth-contract-change.md`; this repo does not edit `kiorex-contracts`).
- The in-process scheduler is multi-instance safe by construction (every transition is a guarded `updateMany`); an EventBridge job `telehealth-tick` (`POST /api/v1/internal/jobs/telehealth-tick`) is available when App Runner runs more than one instance.
